import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDictionary, dictionaryKey } from "../src/dictionary.js";

test("dictionary finds real offline definitions with capitalization and punctuation", async () => {
  const lookup = createDictionary({ loadShard: async (letter) => JSON.parse(await readFile(new URL(`../data/dictionary/${letter}.json`, import.meta.url), "utf8")) });
  const approach = await lookup("“Approach,”");
  assert.equal(approach.provider, "ECDICT");
  assert.match(approach.translation, /接近/);
  assert.match(approach.translation, /\n/);
  assert.ok(approach.phonetic);
  for (const word of ["hello", "curiosity", "beautiful", "discovery", "world", "reading", "went", "children"]) {
    assert.ok(await lookup(word), `${word} should be available offline`);
  }
  assert.equal(await lookup("a short phrase"), null);
  assert.equal(await lookup("zzzsomenonexistentwordzzz"), null);
  assert.equal(await lookup("__proto__"), null);
  assert.equal(dictionaryKey("Don't!"), "don't");
});

test("inflections follow explicit dictionary aliases and do not reuse the base phonetic", async () => {
  let loads = 0;
  const lookup = createDictionary({ loadShard: async (letter) => {
    loads += 1;
    return letter === "w" ? { went: ["go"] } : { go: ["gəʊ", "vi. 去"] };
  } });
  const result = await lookup("went");
  assert.equal(result.lemma, "go");
  assert.equal(result.phonetic, "");
  assert.equal(result.translation, "vi. 去");
  await lookup("went");
  assert.equal(loads, 2);
});

test("a failed dictionary shard can be retried", async () => {
  let calls = 0;
  const lookup = createDictionary({ loadShard: async () => {
    if (++calls === 1) throw Error("temporary read failure");
    return { hello: ["həˈləʊ", "int. 你好"] };
  } });
  await assert.rejects(lookup("hello"));
  assert.ok(await lookup("hello"));
});
