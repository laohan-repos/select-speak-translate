import { DEFAULT_SETTINGS, normalizeSettings } from "./core.js";

const $ = (id) => document.getElementById(id);
let voices = [];
let settings = { ...DEFAULT_SETTINGS };
let saveQueue = Promise.resolve();
let feedbackTimer;

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || "操作失败，请重新打开扩展重试。");
  return result;
}

function feedback(text, isError = false) {
  clearTimeout(feedbackTimer);
  $("feedback").textContent = text;
  $("feedback").className = `feedback${isError ? " error" : ""}`;
  if (!isError) feedbackTimer = setTimeout(() => { $("feedback").textContent = ""; }, 2200);
}

function updateStatus() {
  $("status").replaceChildren();
  $("status").append(document.createElement("i"), settings.enabled ? "已开启，随时查词" : "已暂停划词翻译");
  $("status").classList.toggle("paused", !settings.enabled);
  $("preview").disabled = !settings.enabled;
  $("rateValue").value = `${settings.rate.toFixed(1)}×`;
}

function renderVoices() {
  const select = $("voiceName");
  select.replaceChildren(new Option("系统默认发音", ""));
  voices.filter((voice) => voice.lang?.toLowerCase() === settings.accent.toLowerCase()).forEach((voice) => {
    select.add(new Option(`${voice.voiceName}${voice.remote ? " · 在线" : ""}`, voice.voiceName));
  });
  if ([...select.options].some((option) => option.value === settings.voiceName)) select.value = settings.voiceName;
  else { settings.voiceName = ""; select.value = ""; }
}

function readForm() {
  return normalizeSettings({
    enabled: $("enabled").checked,
    autoSpeak: $("autoSpeak").checked,
    onlineFallback: $("onlineFallback").checked,
    accent: document.querySelector("input[name=accent]:checked").value,
    rate: Number($("rate").value),
    voiceName: $("voiceName").value,
  });
}

function save() {
  const next = readForm();
  if (next.accent !== settings.accent) {
    settings = { ...next, voiceName: "" };
    renderVoices();
  } else settings = next;
  updateStatus();
  const snapshot = { ...settings };
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await send({ type: "settings:save", settings: snapshot });
    feedback("偏好已保存");
  }).catch((error) => { feedback(error.message, true); throw error; });
  // Keep the rejection observable by preview, without an unhandled rejection.
  saveQueue.catch(() => {});
}

$("preferences").addEventListener("submit", (event) => event.preventDefault());
$("preferences").addEventListener("change", save);
$("enabled").addEventListener("change", save);
$("rate").addEventListener("input", () => { $("rateValue").value = `${Number($("rate").value).toFixed(1)}×`; });

$("preview").addEventListener("click", async () => {
  try {
    await saveQueue;
    await send({ type: "speech:speak", text: "Hello. Enjoy reading with SelectSpeak.", requestId: "preview" });
    feedback("正在试听发音");
  } catch (error) { feedback(error.message, true); }
});

$("practice").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("practice.html") });
});

try {
  const [preferences, availableVoices] = await Promise.all([
    send({ type: "settings:get" }),
    send({ type: "voices:get" }).catch(() => ({ voices: [] })),
  ]);
  settings = preferences.settings;
  voices = availableVoices.voices;
  $("enabled").checked = settings.enabled;
  $("autoSpeak").checked = settings.autoSpeak;
  $("onlineFallback").checked = settings.onlineFallback;
  $("rate").value = settings.rate;
  document.querySelector(`input[name=accent][value="${settings.accent}"]`).checked = true;
  renderVoices();
  updateStatus();
  $("enabled").disabled = false;
  $("controls").disabled = false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (/^(chrome|edge|about):/.test(tab?.url ?? "") || /chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons/.test(tab?.url ?? "")) {
    $("pageHint").textContent = "浏览器设置页和扩展商店不允许划词。请打开普通网页，或点击下方「去试一试」。";
  }
} catch (error) { feedback(error.message, true); }
