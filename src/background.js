import { CACHE_LIMIT, createTranslator, normalizeSettings, normalizeText } from "./core.js";
import { createDictionary } from "./dictionary.js";

let cacheWrites = Promise.resolve();
let speechRevision = 0;
let speechOwner = null;

const cache = {
  async get(key) {
    try {
      const { translations = {} } = await chrome.storage.session.get("translations");
      return translations[key];
    } catch { return undefined; }
  },
  set(key, value) {
    cacheWrites = cacheWrites.catch(() => {}).then(async () => {
      const { translations = {} } = await chrome.storage.session.get("translations");
      translations[key] = value;
      const entries = Object.entries(translations).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, CACHE_LIMIT);
      await chrome.storage.session.set({ translations: Object.fromEntries(entries) });
    });
    return cacheWrites;
  },
};

const translate = createTranslator({ cache });
const lookupDictionary = createDictionary({
  loadShard: async (letter) => {
    const response = await fetch(chrome.runtime.getURL(`data/dictionary/${letter}.json`));
    if (!response.ok) throw new Error("本地词库加载失败，请重新加载扩展。");
    return response.json();
  },
});

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings);
}

function stopSpeech() {
  speechRevision += 1;
  speechOwner = null;
  chrome.tts.stop();
}

function notifySpeech(owner, event) {
  if (owner?.tabId === undefined) return;
  chrome.tabs.sendMessage(owner.tabId, {
    type: "speech:event",
    requestId: owner.requestId,
    event: event.type,
    error: event.type === "error" ? "当前语音无法播放，请在扩展中更换发音后重试。" : undefined,
  }, { frameId: owner.frameId }).catch(() => {});
}

async function speak(message, sender) {
  const text = normalizeText(message.text);
  const revision = ++speechRevision;
  chrome.tts.stop();
  const owner = { tabId: sender.tab?.id, frameId: sender.frameId ?? 0, requestId: message.requestId };
  // Reserve ownership before storage I/O, so closing a card also cancels pending speech.
  speechOwner = owner;
  const settings = await getSettings();
  if (!settings.enabled) throw new Error("划词功能已暂停，请在扩展中重新开启。");
  if (revision !== speechRevision) return { skipped: true };
  const options = {
    lang: settings.accent,
    rate: settings.rate,
    enqueue: false,
    onEvent(event) {
      notifySpeech(owner, event);
      if (["end", "interrupted", "cancelled", "error"].includes(event.type) && speechOwner === owner) {
        speechOwner = null;
      }
    },
  };
  if (settings.voiceName) options.voiceName = settings.voiceName;
  try { await chrome.tts.speak(text, options); }
  catch {
    if (speechOwner === owner) speechOwner = null;
    throw new Error("无法启动朗读，请在扩展中检查发音设置。");
  }
  return { started: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return false;
  const isExtensionPage = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
  const handle = async () => {
    switch (message.type) {
      case "settings:get": return { settings: await getSettings() };
      case "settings:save": {
        // Only extension pages may change settings or clear cached data.
        if (!isExtensionPage) throw new Error("不支持的操作。");
        const settings = normalizeSettings(message.settings);
        await chrome.storage.local.set({ settings });
        if (!settings.enabled || !settings.autoSpeak) stopSpeech();
        return { settings };
      }
      case "translation:get": {
        const settings = await getSettings();
        if (!settings.enabled) throw new Error("划词功能已暂停。");
        const text = normalizeText(message.text);
        const entry = await lookupDictionary(text);
        if (entry) return { result: entry };
        if (!settings.onlineFallback) throw new Error("本地词典暂未收录，可在扩展设置中开启「在线补充翻译」。");
        return { result: await translate(text) };
      }
      case "speech:speak": return speak(message, sender);
      case "speech:stop": {
        if ((isExtensionPage && !sender.tab) || (speechOwner?.tabId === sender.tab?.id && speechOwner?.frameId === (sender.frameId ?? 0)
          && speechOwner?.requestId === message.requestId)) stopSpeech();
        return {};
      }
      case "voices:get": {
        const voices = (await chrome.tts.getVoices()).filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
        return { voices: voices.map(({ voiceName, lang, remote }) => ({ voiceName, lang, remote })) };
      }
      case "cache:clear": {
        if (!isExtensionPage) throw new Error("不支持的操作。");
        await cacheWrites.catch(() => {});
        await chrome.storage.session.remove("translations");
        return {};
      }
      default: throw new Error("不支持的操作。");
    }
  };
  handle().then((result) => sendResponse({ ok: true, ...result }), (error) => {
    sendResponse({ ok: false, error: error.message || "操作失败，请重试。" });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ settings: await getSettings() });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (speechOwner?.tabId === tabId) stopSpeech();
});
