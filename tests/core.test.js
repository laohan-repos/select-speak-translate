import test from "node:test";
import assert from "node:assert/strict";
import { createTranslator, normalizeSettings, normalizeText, parseTranslation, decodeEntities, CACHE_TTL } from "../src/core.js";

const success = (text = "你好") => ({ ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: text } }) });

test("fresh installation enables automatic speech and settings reject invalid values", () => {
  assert.equal(normalizeSettings().autoSpeak, true);
  assert.equal(normalizeSettings().onlineFallback, true);
  assert.equal(normalizeSettings(null).rate, 0.9);
  assert.equal(normalizeSettings({ rate: Infinity, accent: "invalid", enabled: "false" }).rate, 0.9);
  assert.equal(normalizeSettings({ rate: 9 }).rate, 1.5);
  assert.equal(normalizeSettings({ rate: -9 }).rate, 0.5);
});

test("selection validation handles whitespace, non-English and service byte limits", () => {
  assert.equal(normalizeText("  hello\n world\t"), "hello world");
  assert.throws(() => normalizeText("你好"), /英文/);
  assert.throws(() => normalizeText("x".repeat(161)), /160/);
  assert.equal(normalizeText("a" + "😀".repeat(79)).length, 159);
  assert.throws(() => normalizeText("a" + "😀".repeat(80)), /160/);
  assert.throws(() => normalizeText(undefined), /英文/);
});

test("HTML entities become text without interpreting markup", () => {
  assert.equal(decodeEntities("Tom &amp; Jerry &#x1f600; &#39; &lt;b&gt;"), "Tom & Jerry 😀 ' <b>");
  assert.equal(decodeEntities("&#99999999; &#xD800;"), "&#99999999; &#xD800;");
});

test("quota and malformed responses never become translations", () => {
  assert.throws(() => parseTranslation({ responseStatus: 200, quotaFinished: true, responseData: { translatedText: "LIMIT" } }), /额度/);
  assert.throws(() => parseTranslation({ responseStatus: 500 }), /不可用/);
  assert.throws(() => parseTranslation({ responseStatus: 200, responseData: { translatedText: " " } }), /没有找到/);
});

test("concurrent repeated lookups share a request; successful results are cached", async () => {
  let requests = 0;
  const entries = new Map();
  const lookup = createTranslator({
    fetchImpl: async (url, options) => {
      requests += 1;
      assert.equal(new URL(url).searchParams.get("q"), "hello world");
      assert.equal(options.credentials, "omit");
      return success();
    },
    cache: { get: async (key) => entries.get(key), set: async (key, value) => entries.set(key, value) },
  });
  const results = await Promise.all([lookup("hello world"), lookup("hello world")]);
  assert.equal(requests, 1);
  assert.equal(results[0].translation, "你好");
  assert.equal((await lookup("hello world")).cached, true);
  assert.equal(requests, 1);
});

test("expired translations refresh and storage failures preserve the result", async () => {
  let requested = false;
  const lookup = createTranslator({
    now: () => CACHE_TTL + 1,
    fetchImpl: async () => { requested = true; return success("新译文"); },
    cache: { get: async () => ({ savedAt: 0, result: { translation: "旧译文" } }), set: async () => { throw Error("storage full"); } },
  });
  assert.equal((await lookup("new word")).translation, "新译文");
  assert.equal(requested, true);
});

test("network failures can be retried without leaving a poisoned in-flight request", async () => {
  let count = 0;
  const lookup = createTranslator({ fetchImpl: async () => {
    if (++count === 1) throw new TypeError("Failed to fetch");
    return success();
  } });
  await assert.rejects(lookup("hello"), /检查网络/);
  assert.equal((await lookup("hello")).translation, "你好");
  assert.equal(count, 2);
});

test("timeouts abort requests and report a useful retry message", async () => {
  const lookup = createTranslator({ timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }) });
  await assert.rejects(lookup("hello"), /超时/);
});
