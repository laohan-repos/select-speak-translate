export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  autoSpeak: true,
  onlineFallback: true,
  rate: 0.9,
  accent: "en-US",
  voiceName: "",
});

export const MAX_TEXT_LENGTH = 160;
export const MAX_TEXT_BYTES = 480;
export const CACHE_LIMIT = 200;
export const CACHE_TTL = 24 * 60 * 60 * 1000;

export function normalizeSettings(value = {}) {
  const settings = value && typeof value === "object" ? value : {};
  return {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : true,
    autoSpeak: typeof settings.autoSpeak === "boolean" ? settings.autoSpeak : true,
    onlineFallback: typeof settings.onlineFallback === "boolean" ? settings.onlineFallback : true,
    rate: typeof settings.rate === "number" && Number.isFinite(settings.rate)
      ? Math.min(1.5, Math.max(0.5, settings.rate)) : DEFAULT_SETTINGS.rate,
    accent: settings.accent === "en-GB" ? "en-GB" : "en-US",
    voiceName: typeof settings.voiceName === "string" ? settings.voiceName.slice(0, 200) : "",
  };
}

export function normalizeText(value) {
  if (typeof value !== "string") throw new Error("请选择英文单词或短语。");
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!text || !/[a-z]/i.test(text)) throw new Error("请选择英文单词或短语。");
  if (text.length > MAX_TEXT_LENGTH || new TextEncoder().encode(text).length > MAX_TEXT_BYTES) {
    throw new Error(`一次最多选择 ${MAX_TEXT_LENGTH} 个字符，请缩短所选内容。`);
  }
  return text;
}

export function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : match;
  });
}

export function parseTranslation(data) {
  if (data?.quotaFinished || Number(data?.responseStatus) === 429 || Number(data?.responseStatus) === 403) {
    throw new Error("翻译服务的免费额度已用完，请稍后再试。朗读仍可使用。");
  }
  if (Number(data?.responseStatus) !== 200 || typeof data?.responseData?.translatedText !== "string") {
    throw new Error("翻译服务暂时不可用，请稍后重试。");
  }
  const translation = decodeEntities(data.responseData.translatedText).trim();
  if (!translation) throw new Error("没有找到译文，请选择其他单词重试。");
  return { translation, provider: "MyMemory", source: "en", target: "zh-CN" };
}

// One in-flight request per text; failed requests are never cached.
export function createTranslator({ fetchImpl = fetch, cache, now = Date.now, timeoutMs = 10000 } = {}) {
  const pending = new Map();
  return async function translate(value) {
    const text = normalizeText(value);
    const key = `en|zh-CN|${text}`;
    const cached = await cache?.get(key);
    if (cached && now() - cached.savedAt < CACHE_TTL) return { ...cached.result, cached: true };
    if (pending.has(key)) return pending.get(key);

    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = new URL("https://api.mymemory.translated.net/get");
        url.search = new URLSearchParams({ q: text, langpair: "en|zh-CN" }).toString();
        const response = await fetchImpl(url.toString(), {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          cache: "no-store",
        });
        if (response.status === 429) throw new Error("翻译请求过于频繁，请稍后重试。");
        if (!response.ok) throw new Error("翻译服务暂时不可用，请稍后重试。");
        const result = parseTranslation(await response.json());
        // A storage failure must not hide an otherwise successful translation.
        try { await cache?.set(key, { result, savedAt: now() }); } catch { /* best effort */ }
        return { ...result, cached: false };
      } catch (error) {
        if (controller.signal.aborted) throw new Error("翻译请求超时，请检查网络后重试。朗读仍可使用。");
        if (error instanceof TypeError) throw new Error("暂时连接不到翻译服务，请检查网络后重试。");
        if (error instanceof SyntaxError) throw new Error("翻译服务返回了异常内容，请稍后重试。");
        throw error;
      } finally {
        clearTimeout(timer);
      }
    })();
    pending.set(key, request);
    try { return await request; } finally { pending.delete(key); }
  };
}
