import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let listener;
let settings = {};
let delayedRead;
const spoken = [];
const messages = [];
let stops = 0;
const contentSender = { id: "test", url: "https://example.com/article", tab: { id: 7 }, frameId: 2 };
const popupSender = { id: "test", url: "chrome-extension://test/popup.html" };

globalThis.chrome = {
  runtime: { id: "test", getURL: (path) => `chrome-extension://test/${path}`,
    onMessage: { addListener: (callback) => { listener = callback; } },
    onInstalled: { addListener() {} } },
  storage: {
    local: {
      get: async () => {
        if (delayedRead) { const read = delayedRead; delayedRead = undefined; return read; }
        return { settings };
      },
      set: async (value) => { settings = value.settings; },
    },
    session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
  },
  tts: { stop: () => { stops += 1; }, speak: async (text, options) => { spoken.push({ text, options }); }, getVoices: async () => [] },
  tabs: { sendMessage: async (...args) => { messages.push(args); }, onRemoved: { addListener() {} } },
};
globalThis.fetch = async (url) => {
  const pathname = new URL(url).pathname.slice(1);
  return { ok: true, json: async () => JSON.parse(await readFile(new URL(`../${pathname}`, import.meta.url), "utf8")) };
};
await import("../src/background.js");

const request = (message, sender = contentSender) => new Promise((resolve) => {
  assert.equal(listener(message, sender, resolve), true);
});

test("closing a card cancels speech even while the settings read is pending", async () => {
  let release;
  delayedRead = new Promise((resolve) => { release = resolve; });
  const before = spoken.length;
  const pending = request({ type: "speech:speak", text: "hello", requestId: "closed" });
  await request({ type: "speech:stop", requestId: "closed" });
  release({ settings: {} });
  assert.equal((await pending).skipped, true);
  assert.equal(spoken.length, before);
});

test("a later selection wins when previous speech preparation finishes late", async () => {
  let release;
  delayedRead = new Promise((resolve) => { release = resolve; });
  const previous = request({ type: "speech:speak", text: "old", requestId: "old" });
  await request({ type: "speech:speak", text: "new", requestId: "new" });
  release({ settings: {} });
  assert.equal((await previous).skipped, true);
  assert.equal(spoken.at(-1).text, "new");
});

test("another frame cannot stop speech and playback events return to the correct frame", async () => {
  await request({ type: "speech:speak", text: "hello", requestId: "owner" });
  const before = stops;
  await request({ type: "speech:stop", requestId: "owner" }, { ...contentSender, frameId: 9 });
  assert.equal(stops, before);
  spoken.at(-1).options.onEvent({ type: "end" });
  assert.equal(messages.at(-1)[0], 7);
  assert.equal(messages.at(-1)[1].requestId, "owner");
  assert.deepEqual(messages.at(-1)[2], { frameId: 2 });
});

test("web content cannot change settings; an extension settings page can", async () => {
  assert.equal((await request({ type: "settings:save", settings: { enabled: false } })).ok, false);
  assert.equal((await request({ type: "settings:save", settings: { enabled: false } }, popupSender)).ok, true);
  assert.equal((await request({ type: "translation:get", text: "hello" })).ok, false);
  assert.equal((await request({ type: "speech:speak", text: "hello" })).ok, false);
  await request({ type: "settings:save", settings: { enabled: true, onlineFallback: false } }, popupSender);
});

test("real dictionary queries work offline and unknown words respect offline-only settings", async () => {
  const result = await request({ type: "translation:get", text: "hello" });
  assert.equal(result.ok, true);
  assert.equal(result.result.provider, "ECDICT");
  assert.match(result.result.translation, /你好|喂/);
  const missing = await request({ type: "translation:get", text: "zzzsomenonexistentwordzzz" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /在线补充翻译/);
});
