(() => {
  if (globalThis.__selectSpeakLoaded) return;
  globalThis.__selectSpeakLoaded = true;

  let settings = { enabled: true, autoSpeak: true };
  let selectionTimer;
  let pointerDown = false;
  let current = null;
  let ui = null;

  const speakerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" stroke-linejoin="round"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" stroke-linecap="round"/></svg>';
  const stopIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>';

  async function send(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) throw new Error(response?.error || "操作失败，请重试。");
      return response;
    } catch (error) {
      if (/context invalidated|receiving end does not exist|message port closed/i.test(error.message)) {
        throw new Error("扩展已更新，请刷新当前网页后继续使用。");
      }
      throw error;
    }
  }

  const ready = send({ type: "settings:get" }).then((response) => {
    settings = response.settings;
  }).catch(() => { settings.enabled = false; });

  function ensureUI() {
    if (ui && ui.host.isConnected) return ui;
    const host = document.createElement("div");
    host.id = "selectspeak-root";
    host.style.cssText = "all:initial!important;position:fixed!important;left:0!important;top:0!important;z-index:2147483647!important;display:none!important;color-scheme:light!important;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial;color-scheme:light}*{box-sizing:border-box}
      .card{width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#fff;color:#162838;border:1px solid #e3e9ed;border-radius:18px;box-shadow:0 12px 45px #172b4430,0 2px 8px #172b440a;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;text-align:left;letter-spacing:normal;animation:enter .14s ease-out}
      .top{display:flex;align-items:center;justify-content:space-between;padding:13px 16px 0}.brand{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#88969e}.dot{width:6px;height:6px;border-radius:50%;background:#327d65}
      button{font:inherit;cursor:pointer;border:0;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}button:focus-visible{outline:3px solid #8fb8fd;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}
      .close{width:25px;height:25px;border-radius:8px;background:transparent;color:#87929e;font-size:20px;line-height:1}.close:hover{background:#f0f3f5}
      .body{padding:8px 19px 18px}.word-row{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}.word{margin:0;font-size:23px;font-weight:650;line-height:1.35;letter-spacing:-.5px;overflow-wrap:anywhere;white-space:pre-wrap}.speak{width:36px;height:36px;flex-shrink:0;border-radius:50%;background:#ecf5f0;color:#28785e;margin-top:1px}.speak:hover{background:#dbeee3}.speak[data-playing=true]{background:#28785e;color:#fff}.speak svg{width:19px;height:19px}
      .phonetic{margin-top:4px;color:#85939f;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-wrap:anywhere}.translation{margin-top:14px;padding-top:13px;border-top:1px solid #edf0f2;white-space:pre-line;overflow-wrap:anywhere;font-size:15px;line-height:1.85}.translation.loading{color:#8a959e;font-size:13px}.translation.error{color:#ae493b;font-size:13px}.loading:before{content:"";display:inline-block;width:10px;height:10px;margin-right:8px;border:2px solid #dce7e1;border-top-color:#377f65;border-radius:50%;animation:spin .8s linear infinite}
      .retry{margin-top:9px;background:#f4f6f8;color:#526475;border-radius:7px;padding:4px 11px;font-size:12px}.retry[hidden]{display:none}.audio-error{color:#ae493b;font-size:12px;margin-top:8px}.audio-error:empty{display:none}.footer{display:flex;justify-content:space-between;gap:8px;background:#f7f9f8;border-top:1px solid #edf0f2;padding:9px 18px;font-size:10px;color:#8b989f}.source{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}kbd{font:inherit;color:#9aa5ac}
      @keyframes spin{to{transform:rotate(360deg)}}@keyframes enter{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
    `;
    shadow.append(style);
    const card = document.createElement("section");
    card.className = "card";
    card.setAttribute("aria-label", "划词翻译");
    // This template is static. Selected text and remote results only use textContent.
    card.innerHTML = `<div class="top"><span class="brand"><i class="dot"></i>SELECTSPEAK</span><button class="close" aria-label="关闭翻译" title="关闭 (Esc)">×</button></div><div class="body"><div class="word-row"><h2 class="word"></h2><button class="speak" aria-label="朗读所选英文" title="朗读">${speakerIcon}</button></div><div class="phonetic"></div><div class="translation" aria-live="polite"></div><button class="retry" hidden>重新翻译</button><div class="audio-error" role="status"></div></div><div class="footer"><span class="source">英 → 简体中文</span><kbd>Esc 关闭</kbd></div>`;
    shadow.append(card);
    (document.body || document.documentElement).append(host);
    ui = {
      host, shadow, card,
      word: shadow.querySelector(".word"),
      translation: shadow.querySelector(".translation"),
      phonetic: shadow.querySelector(".phonetic"),
      source: shadow.querySelector(".source"),
      speak: shadow.querySelector(".speak"),
      retry: shadow.querySelector(".retry"),
      audioError: shadow.querySelector(".audio-error"),
    };
    shadow.querySelector(".close").addEventListener("click", hide);
    ui.speak.addEventListener("click", () => {
      if (!current) return;
      if (current.playing) {
        send({ type: "speech:stop", requestId: current.id }).catch(() => {});
        setPlaying(false);
      } else play(current);
    });
    ui.retry.addEventListener("click", () => current && lookup(current));
    shadow.addEventListener("pointerdown", (event) => event.stopPropagation());
    return ui;
  }

  function setPlaying(playing) {
    if (!ui || !current) return;
    current.playing = playing;
    ui.speak.dataset.playing = String(playing);
    ui.speak.innerHTML = playing ? stopIcon : speakerIcon;
    ui.speak.setAttribute("aria-label", playing ? "停止朗读" : "朗读所选英文");
    ui.speak.title = playing ? "停止朗读" : "再读一次";
  }

  function position() {
    if (!current || !ui) return;
    const { rect } = current;
    const width = ui.card.offsetWidth;
    const height = ui.card.offsetHeight;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    let top = rect.bottom + 10;
    if (top + height > window.innerHeight - 12) top = rect.top - height - 10;
    top = Math.max(12, Math.min(top, window.innerHeight - height - 12));
    ui.host.style.setProperty("left", `${left}px`, "important");
    ui.host.style.setProperty("top", `${top}px`, "important");
  }

  function hide() {
    clearTimeout(selectionTimer);
    const previous = current;
    current = null;
    if (ui) ui.host.style.setProperty("display", "none", "important");
    if (previous) send({ type: "speech:stop", requestId: previous.id }).catch(() => {});
  }

  async function play(selection) {
    if (selection !== current) return;
    ui.audioError.textContent = "";
    setPlaying(true);
    try {
      await send({ type: "speech:speak", text: selection.text, requestId: selection.id });
    } catch (error) {
      if (selection !== current) return;
      setPlaying(false);
      ui.audioError.textContent = error.message;
      position();
    }
  }

  async function lookup(selection) {
    ui.translation.textContent = "正在查询释义…";
    ui.translation.className = "translation loading";
    ui.retry.hidden = true;
    position();
    try {
      const { result } = await send({ type: "translation:get", text: selection.text });
      if (selection !== current) return;
      ui.translation.textContent = result.translation;
      ui.translation.className = "translation";
      ui.phonetic.textContent = result.phonetic ? `/${result.phonetic}/` : result.lemma ? `原形：${result.lemma}` : "";
      ui.source.textContent = result.provider === "ECDICT" ? "本地词典 · ECDICT" : "在线翻译 · MyMemory";
    } catch (error) {
      if (selection !== current) return;
      ui.translation.textContent = error.message;
      ui.translation.className = "translation error";
      ui.retry.hidden = false;
    }
    position();
  }

  function isEditable(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.isContentEditable || Boolean(element?.closest("input, textarea, select, [role=textbox]"));
  }

  async function inspectSelection() {
    await ready;
    if (!settings.enabled || pointerDown) return;
    if (current && ui?.shadow.activeElement) return;
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) {
      hide();
      return;
    }
    if (ui?.shadow.contains(selected.anchorNode) || ui?.shadow.contains(selected.focusNode)) return;
    if (isEditable(selected.anchorNode) || isEditable(selected.focusNode)) return;
    const text = selected.toString().replace(/\s+/g, " ").trim();
    if (!/[a-z]/i.test(text) || text.length > 160 || new TextEncoder().encode(text).length > 480) {
      hide();
      return;
    }
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    if (current?.text === text) return;
    hide();
    ensureUI();
    current = { id: crypto.randomUUID(), text, rect, playing: false };
    ui.word.textContent = text;
    ui.phonetic.textContent = "";
    ui.audioError.textContent = "";
    ui.source.textContent = "英 → 简体中文";
    ui.host.style.setProperty("display", "block", "important");
    setPlaying(false);
    lookup(current);
    if (settings.autoSpeak) play(current);
  }

  function schedule() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(inspectSelection, 140);
  }

  document.addEventListener("pointerdown", (event) => {
    if (ui && event.composedPath().includes(ui.host)) return;
    pointerDown = true;
    hide();
  }, true);
  document.addEventListener("pointerup", (event) => {
    pointerDown = false;
    if (event.button === 0 && !(ui && event.composedPath().includes(ui.host))) schedule();
  }, true);
  document.addEventListener("pointercancel", () => { pointerDown = false; });
  document.addEventListener("selectionchange", () => { if (!pointerDown) schedule(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  }, true);
  window.addEventListener("scroll", (event) => {
    if (ui && event.composedPath().includes(ui.host)) return;
    hide();
  }, true);
  window.addEventListener("resize", hide);
  window.addEventListener("blur", () => { pointerDown = false; hide(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hide(); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = changes.settings.newValue ?? { enabled: true, autoSpeak: true };
    if (!settings.enabled) hide();
    if (!settings.autoSpeak) setPlaying(false);
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "speech:event" || message.requestId !== current?.id) return;
    if (message.event === "start") setPlaying(true);
    if (["end", "interrupted", "cancelled", "error"].includes(message.event)) setPlaying(false);
    if (message.error && ui) {
      ui.audioError.textContent = message.error;
      position();
    }
  });
})();
