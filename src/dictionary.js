export function dictionaryKey(text) {
  return text.toLowerCase().replace(/^[\s"'“”‘’([{]+|[\s"'“”‘’.,!?;:)\]}]+$/g, "").replace(/’/g, "'");
}

export function createDictionary({ loadShard }) {
  const shards = new Map();
  function load(letter) {
    if (!shards.has(letter)) {
      const request = Promise.resolve().then(() => loadShard(letter)).catch((error) => {
        shards.delete(letter);
        throw error;
      });
      shards.set(letter, request);
    }
    return shards.get(letter);
  }

  return async function lookup(text) {
    const key = dictionaryKey(text);
    if (!/^[a-z][a-z'-]*$/.test(key)) return null;
    const shard = await load(key[0]);
    let entry = Object.hasOwn(shard, key) ? shard[key] : null;
    if (!entry) return null;
    let lemma;
    if (entry.length === 1) {
      lemma = entry[0];
      const base = await load(lemma[0]);
      entry = Object.hasOwn(base, lemma) ? base[lemma] : null;
      if (!entry || entry.length < 2) return null;
    }
    return {
      translation: entry[1],
      phonetic: lemma ? "" : entry[0],
      lemma,
      provider: "ECDICT",
      source: "en",
      target: "zh-CN",
      cached: true,
    };
  };
}
