const DEFAULT_SETTINGS = {
  enabled: true,
  autoOpen: false,
};
const MANUAL_LYRICS_KEY = "manualLyricsByTrack";
const MANUAL_SOURCES_KEY = "manualSourcesByTrack";
const AUTO_SYNC_DRAFT_KEY = "autoSyncDraft";

const state = {
  settings: { ...DEFAULT_SETTINGS },
  track: null,
  trackKey: "",
  lyrics: [],
  lyricTimings: [],
  syncMode: "none",
  lyricsProvider: "",
  sourceUrl: "",
  syncSourceUrl: "",
  searchUrl: "",
  match: null,
  status: "idle",
  error: "",
  panelOpen: false,
  fullscreen: false,
  activeLine: -1,
  requestId: 0,
  editorOpen: false,
  editorTimes: [],
  editorIndex: -1,
  editorMessage: "",
  correctionOpen: false,
  manualSourceUrl: "",
};

let host;
let shadow;
let elements;
let detectTimer;
let progressTimer;

void start();

async function start() {
  state.settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (state.settings.enabled) mount();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (changes[key]) state.settings[key] = changes[key].newValue;
    }

    if (state.settings.enabled && !host) mount();
    if (!state.settings.enabled && host) unmount();
    if (changes[MANUAL_LYRICS_KEY] && state.track) void loadLyrics(state.track, true);
    render();
  });
}

function mount() {
  if (host) return;

  host = document.createElement("div");
  host.id = "sc-genius-companion-root";
  document.documentElement.append(host);
  shadow = host.attachShadow({ mode: "open" });

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("styles.css");

  const app = document.createElement("div");
  app.innerHTML = markup();
  shadow.append(stylesheet, app);

  elements = {
    launcher: shadow.querySelector("[data-action='launcher']"),
    panel: shadow.querySelector(".lyrics-panel"),
    panelBody: shadow.querySelector(".panel-body"),
    panelTitle: shadow.querySelector(".panel-title"),
    panelArtist: shadow.querySelector(".panel-artist"),
    panelArtwork: shadow.querySelector(".panel-artwork"),
    panelSource: shadow.querySelector(".panel-source"),
    correction: shadow.querySelector(".source-correction"),
    fullscreen: shadow.querySelector(".lyrics-fullscreen"),
    fullscreenTitle: shadow.querySelector(".fullscreen-title"),
    fullscreenArtist: shadow.querySelector(".fullscreen-artist"),
    fullscreenSyncText: shadow.querySelector(".fullscreen-sync-text"),
    fullscreenBody: shadow.querySelector(".fullscreen-body"),
    artwork: shadow.querySelector(".fullscreen-artwork"),
    backdrop: shadow.querySelector(".fullscreen-backdrop"),
    providerLabels: [...shadow.querySelectorAll(".lyrics-provider")],
    syncNote: shadow.querySelector(".sync-note"),
    syncEditButton: shadow.querySelector(".sync-edit-button"),
    editor: shadow.querySelector(".lyrics-editor"),
    editorBody: shadow.querySelector(".editor-body"),
  };

  shadow.addEventListener("click", handleClick);
  shadow.addEventListener("keydown", handleKeydown);
  shadow.addEventListener("change", handleChange);
  detectTimer = window.setInterval(detectTrack, 1000);
  progressTimer = window.setInterval(() => {
    updateProgress();
    updateEditorClock();
  }, 350);
  detectTrack();
  render();
}

function unmount() {
  window.clearInterval(detectTimer);
  window.clearInterval(progressTimer);
  host?.remove();
  host = undefined;
  shadow = undefined;
  elements = undefined;
}

function markup() {
  return `
    <button class="lyrics-launcher" type="button" data-action="launcher" aria-label="Открыть текст песни">
      <span class="launcher-bars" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>Lyrics</span>
    </button>

    <aside class="lyrics-panel" aria-label="Текст текущей песни" aria-hidden="true">
      <header class="panel-header">
        <img class="panel-artwork" alt="" decoding="async">
        <div class="track-copy">
          <span class="eyebrow lyrics-provider">LYRICS</span>
          <strong class="panel-title">Ждём трек…</strong>
          <span class="panel-artist"></span>
        </div>
        <div class="header-actions">
          <button type="button" data-action="fullscreen" aria-label="Открыть на весь экран">↗</button>
          <button type="button" data-action="close" aria-label="Закрыть">×</button>
        </div>
      </header>
      <div class="source-correction" hidden></div>
      <div class="panel-body"></div>
      <footer class="panel-footer">
        <span class="sync-note">Ищем синхронизацию…</span>
        <div class="footer-actions">
          <button class="source-correction-button" type="button" data-action="toggle-source">Не тот текст?</button>
          <button class="sync-edit-button" type="button" data-action="sync-editor">+ Метки</button>
          <a class="panel-source" href="https://genius.com" target="_blank" rel="noreferrer">Открыть Genius ↗</a>
        </div>
      </footer>
    </aside>

    <section class="lyrics-fullscreen" aria-label="Полноэкранный текст песни" aria-hidden="true">
      <div class="fullscreen-backdrop"></div>
      <div class="fullscreen-shade"></div>
      <header class="fullscreen-header">
        <div class="fullscreen-brand">
          <span class="eyebrow lyrics-provider">LYRICS</span>
          <span class="fullscreen-service">SoundCloud companion</span>
        </div>
        <button class="fullscreen-close" type="button" data-action="exit-fullscreen" aria-label="Закрыть полноэкранный режим">×</button>
      </header>
      <div class="fullscreen-layout">
        <div class="fullscreen-body"></div>
        <aside class="now-playing" aria-label="Сейчас играет">
          <figure class="artwork-frame"><img class="fullscreen-artwork" alt="Обложка трека" decoding="async"></figure>
          <div class="now-playing-copy">
            <strong class="fullscreen-title"></strong>
            <span class="fullscreen-artist"></span>
          </div>
          <div class="sync-pill"><span class="sync-dot" aria-hidden="true"></span><span class="fullscreen-sync-text">Синхронизация по строкам</span></div>
        </aside>
      </div>
    </section>

    <section class="lyrics-editor" aria-label="Редактор синхронизации" aria-hidden="true">
      <header class="editor-header">
        <div>
          <span class="eyebrow">МОИ МЕТКИ</span>
          <strong>Синхронизация текста</strong>
        </div>
        <button type="button" data-action="close-editor" aria-label="Закрыть редактор">×</button>
      </header>
      <div class="editor-body"></div>
    </section>
  `;
}

function handleClick(event) {
  const lyricLine = event.target.closest(".lyric-line[data-line]");
  if (lyricLine?.classList.contains("is-synced")) {
    seekToLyric(Number(lyricLine.dataset.line));
    return;
  }

  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  if (action === "launcher") {
    state.panelOpen = !state.panelOpen;
  } else if (action === "close") {
    state.panelOpen = false;
  } else if (action === "fullscreen") {
    state.fullscreen = true;
    state.panelOpen = false;
  } else if (action === "exit-fullscreen") {
    state.fullscreen = false;
  } else if (action === "retry") {
    void loadLyrics(state.track, true);
  } else if (action === "toggle-source") {
    state.correctionOpen = !state.correctionOpen;
  } else if (action === "load-manual-url") {
    void loadManualSource();
    return;
  } else if (action === "reset-manual-source") {
    void deleteManualSource();
    return;
  } else if (action === "sync-editor") {
    openSyncEditor();
  } else if (action === "close-editor") {
    state.editorOpen = false;
  } else if (action === "import-lrc") {
    void importLrcFromEditor();
    return;
  } else if (action === "auto-sync") {
    void openAutoSync();
    return;
  } else if (action === "stamp-line") {
    stampCurrentLine();
  } else if (action === "previous-line") {
    moveEditorBack();
  } else if (action === "reset-timing") {
    resetEditorTiming();
  } else if (action === "save-timing") {
    void saveEditorTiming();
    return;
  } else if (action === "delete-manual-timing") {
    void deleteManualTiming();
    return;
  }

  render();
  if (action === "launcher" || action === "fullscreen") {
    requestAnimationFrame(() => applyActiveLine(true));
  }
}

function handleKeydown(event) {
  if (
    state.editorOpen &&
    event.key === " " &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement)
  ) {
    event.preventDefault();
    stampCurrentLine();
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  const lyricLine = event.target.closest(".lyric-line[data-line]");
  if (!lyricLine?.classList.contains("is-synced")) return;
  event.preventDefault();
  seekToLyric(Number(lyricLine.dataset.line));
}

async function handleChange(event) {
  const input = event.target.closest(".lrc-file");
  const file = input?.files?.[0];
  if (!file) return;
  const textarea = elements?.editorBody.querySelector(".lrc-input");
  if (textarea) textarea.value = await file.text();
}

function detectTrack() {
  if (!host) return;
  const track = readCurrentTrack();
  if (!track?.title) {
    if (!state.track) render();
    return;
  }

  const key = `${track.artist}|${track.title}`.toLocaleLowerCase();
  if (key === state.trackKey) {
    state.track = { ...state.track, ...track };
    return;
  }

  state.track = track;
  state.trackKey = key;
  state.lyrics = [];
  state.lyricTimings = [];
  state.syncMode = "none";
  state.lyricsProvider = "";
  state.activeLine = -1;
  state.sourceUrl = "";
  state.syncSourceUrl = "";
  state.searchUrl = "";
  state.match = null;
  state.error = "";
  state.status = "loading";
  state.editorOpen = false;
  state.correctionOpen = false;
  state.manualSourceUrl = "";
  if (state.settings.autoOpen) state.panelOpen = true;
  render();
  void loadLyrics(track);
}

function readCurrentTrack() {
  const mediaMetadata = navigator.mediaSession?.metadata;
  let title = cleanText(mediaMetadata?.title);
  let artist = cleanText(mediaMetadata?.artist);

  title ||= firstText([
    ".playbackSoundBadge__titleLink span[aria-hidden='true']",
    ".playbackSoundBadge__titleLink",
    "[data-testid='playback-sound-badge-title']",
  ]);
  artist ||= firstText([
    ".playbackSoundBadge__lightLink",
    ".playbackSoundBadge__userContextContainer a",
    "[data-testid='playback-sound-badge-artist']",
  ]);

  if (!artist && title.includes(" - ")) {
    const parts = title.split(" - ");
    artist = parts.shift().trim();
    title = parts.join(" - ").trim();
  }

  const artwork =
    mediaMetadata?.artwork?.at(-1)?.src ||
    firstImageSource([
      ".playbackSoundBadge__avatar img",
      ".playbackSoundBadge__avatar span",
      "[data-testid='playback-sound-badge-artwork'] img",
    ]);

  const playback = readPlaybackState();
  return title ? { title, artist, artwork, duration: playback?.duration } : null;
}

async function loadLyrics(track, force = false) {
  if (!track || (!force && `${track.artist}|${track.title}`.toLocaleLowerCase() !== state.trackKey)) return;
  const requestId = ++state.requestId;
  state.status = "loading";
  state.error = "";
  render();

  try {
    const saved = await getSavedTrackData(state.trackKey);
    state.manualSourceUrl = saved.manualSource ?? "";
    const response = saved.manualLyrics?.timedLyrics?.length
      ? {
          ok: true,
          timedLyrics: saved.manualLyrics.timedLyrics,
          lyricsProvider: "Local LRC",
          sourceUrl: saved.manualLyrics.sourceUrl || saved.manualSource || "",
        }
      : await chrome.runtime.sendMessage(
          saved.manualSource
            ? { type: "lyrics:from-url", track, url: saved.manualSource }
            : { type: "lyrics:find", track },
        );
    if (requestId !== state.requestId) return;
    applyLyricsResponse(response);
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.message : "Не удалось загрузить текст.";
  }

  render();
}

function applyLyricsResponse(response) {
  state.sourceUrl = response?.sourceUrl ?? "";
  state.syncSourceUrl = response?.syncSourceUrl ?? "";
  state.searchUrl = response?.searchUrl ?? "";
  state.match = response?.match ?? null;
  state.lyricsProvider = response?.lyricsProvider ?? "";
  state.lyricTimings = [];
  state.syncMode = "plain";
  state.activeLine = -1;

  if (!response?.ok) {
    state.status = "error";
    state.error = response?.error ?? "Не удалось найти текст.";
    state.correctionOpen = true;
    return;
  }

  const timedLyrics = Array.isArray(response.timedLyrics)
    ? response.timedLyrics
        .map((line) => ({ time: Number(line?.time), text: cleanText(line?.text) }))
        .filter((line) => Number.isFinite(line.time) && line.time >= 0 && line.text)
    : [];
  if (timedLyrics.length) {
    state.lyrics = timedLyrics.map((line) => line.text);
    state.lyricTimings = timedLyrics.map((line) => line.time);
    state.syncMode = "timed";
  } else if (typeof response.plainLyrics === "string") {
    state.lyrics = extractPlainLyrics(response.plainLyrics);
  } else {
    state.lyrics = extractLyrics(response.html);
  }

  if (!state.lyrics.length) {
    state.status = "error";
    state.error = "Страница найдена, но текст не удалось прочитать.";
  } else {
    state.status = "ready";
    state.error = "";
  }
}

async function getSavedTrackData(trackKey) {
  const stored = await chrome.storage.local.get({
    [MANUAL_LYRICS_KEY]: {},
    [MANUAL_SOURCES_KEY]: {},
  });
  return {
    manualLyrics: stored[MANUAL_LYRICS_KEY]?.[trackKey],
    manualSource: stored[MANUAL_SOURCES_KEY]?.[trackKey],
  };
}

function extractLyrics(html = "") {
  const documentFragment = new DOMParser().parseFromString(html, "text/html");
  const containers = [...documentFragment.querySelectorAll("[data-lyrics-container='true']")];
  const lines = [];

  for (const container of containers) {
    const clone = container.cloneNode(true);
    clone.querySelectorAll("br").forEach((breakElement) => breakElement.replaceWith("\n"));
    const text = clone.textContent ?? "";
    for (const line of text.split("\n")) {
      const normalized = cleanText(line);
      if (normalized && !isGeniusInterfaceLine(normalized)) lines.push(normalized);
    }
  }

  return removeAdjacentDuplicates(lines).slice(0, 600);
}

function extractPlainLyrics(value = "") {
  const lines = value
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  return removeAdjacentDuplicates(lines).slice(0, 600);
}

function isGeniusInterfaceLine(line) {
  const normalized = line.toLocaleLowerCase();
  return (
    (normalized.includes("contributor") && normalized.includes("lyrics")) ||
    (normalized.includes("contributor") && normalized.includes("translation"))
  );
}

function removeAdjacentDuplicates(lines) {
  return lines.filter((line, index) => index === 0 || line !== lines[index - 1]);
}

function render() {
  if (!elements) return;

  elements.panel.classList.toggle("is-open", state.panelOpen);
  elements.panel.setAttribute("aria-hidden", String(!state.panelOpen));
  elements.fullscreen.classList.toggle("is-open", state.fullscreen);
  elements.fullscreen.classList.toggle("has-timed-lyrics", state.syncMode === "timed");
  elements.fullscreen.setAttribute("aria-hidden", String(!state.fullscreen));
  elements.editor.classList.toggle("is-open", state.editorOpen);
  elements.editor.setAttribute("aria-hidden", String(!state.editorOpen));
  elements.launcher.classList.toggle("has-result", state.status === "ready");
  elements.launcher.setAttribute("aria-expanded", String(state.panelOpen));

  const title = state.match?.title || state.track?.title || "Ждём трек…";
  const artist = state.match?.artist || state.track?.artist || "Включите музыку в SoundCloud";
  elements.panelTitle.textContent = title;
  elements.panelArtist.textContent = artist;
  elements.fullscreenTitle.textContent = title;
  elements.fullscreenArtist.textContent = artist;

  const sourceUrl = state.sourceUrl || state.syncSourceUrl || state.searchUrl || "https://genius.com";
  elements.panelSource.href = sourceUrl;
  elements.panelSource.textContent = state.sourceUrl ? "Открыть Genius ↗" : "Источник текста ↗";

  const providerLabel = state.syncMode === "timed"
    ? `${state.lyricsProvider ? `${state.lyricsProvider.toLocaleUpperCase()} · ` : ""}SYNCED`
    : state.lyricsProvider === "Genius"
      ? "GENIUS LYRICS"
      : "LYRICS";
  elements.providerLabels.forEach((label) => {
    label.textContent = providerLabel;
  });
  elements.syncNote.textContent = state.status === "loading"
    ? "Ищем синхронизацию…"
    : state.syncMode === "timed"
      ? "Синхронизировано по строкам · нажмите строку для перемотки"
      : "Для этой песни нет временных меток";
  elements.syncEditButton.hidden = state.status !== "ready";
  elements.syncEditButton.textContent = state.syncMode === "timed" ? "Изменить метки" : "+ Метки";
  elements.fullscreenSyncText.textContent = state.syncMode === "timed"
    ? "Синхронизация по строкам"
    : "Обычный текст без временных меток";

  const trackArtwork = upgradeArtworkUrl(state.track?.artwork ?? "");
  const matchArtwork = upgradeArtworkUrl(state.match?.artwork ?? "");
  const artwork = matchArtwork || trackArtwork;
  if (artwork) {
    elements.artwork.src = artwork;
    elements.artwork.alt = title ? `Обложка трека ${title}` : "Обложка трека";
    elements.artwork.hidden = false;
    elements.panelArtwork.src = artwork;
    elements.panelArtwork.hidden = false;
    elements.backdrop.style.backgroundImage = `url("${cssUrl(artwork)}")`;
  } else {
    elements.artwork.removeAttribute("src");
    elements.artwork.hidden = true;
    elements.panelArtwork.removeAttribute("src");
    elements.panelArtwork.hidden = true;
    elements.backdrop.style.backgroundImage = "none";
  }

  renderBody(elements.panelBody, false);
  renderBody(elements.fullscreenBody, true);
  renderCorrection();
  renderEditor();
  applyActiveLine(false);
  updateProgress();
}

function renderBody(container, large) {
  container.replaceChildren();

  if (!state.track) {
    container.append(statusView("Включите любой трек", "Панель появится автоматически, когда SoundCloud начнёт воспроизведение."));
    return;
  }

  if (state.status === "loading") {
    const view = statusView("Ищу текст и синхронизацию…", `${state.track.artist} — ${state.track.title}`);
    view.classList.add("is-loading");
    container.append(view);
    return;
  }

  if (state.status === "error") {
    const view = statusView("Текст не найден", state.error);
    const actions = document.createElement("div");
    actions.className = "status-actions";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.action = "retry";
    retry.textContent = "Повторить";
    actions.append(retry);

    if (state.searchUrl || state.sourceUrl) {
      const link = document.createElement("a");
      link.href = state.sourceUrl || state.searchUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Найти вручную ↗";
      actions.append(link);
    }

    view.append(actions);
    container.append(view);
    return;
  }

  state.lyrics.forEach((line, index) => {
    const row = document.createElement("p");
    row.className = "lyric-line";
    if (large) row.classList.add("is-large");
    const isSection = /^\[.+]$/.test(line);
    const isTimed = state.syncMode === "timed" && Number.isFinite(state.lyricTimings[index]);
    if (isSection) {
      row.classList.add("is-section");
    }
    if (isTimed) {
      row.classList.add("is-synced");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `Перейти к строке: ${line}`);
      row.title = `Перемотать к ${formatTime(state.lyricTimings[index])}`;
    }
    row.dataset.line = String(index);
    row.textContent = line;
    container.append(row);
  });
}

function renderCorrection() {
  if (!elements?.correction) return;
  elements.correction.hidden = !state.correctionOpen;
  elements.correction.replaceChildren();
  if (state.correctionOpen) elements.correction.append(manualSourceView());
}

function manualSourceView() {
  const form = document.createElement("div");
  form.className = "manual-source";

  const label = document.createElement("label");
  label.htmlFor = "sc-genius-manual-url";
  label.textContent = "Укажите правильный текст";

  const row = document.createElement("div");
  const input = document.createElement("input");
  input.id = "sc-genius-manual-url";
  input.className = "manual-url";
  input.type = "url";
  input.placeholder = "https://genius.com/artist-song-lyrics";
  input.autocomplete = "off";
  input.value = state.manualSourceUrl || (state.sourceUrl.includes("genius.com") ? state.sourceUrl : "");

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "load-manual-url";
  button.textContent = "Загрузить";
  row.append(input, button);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "manual-reset";
  reset.dataset.action = "reset-manual-source";
  reset.textContent = "Вернуть автопоиск";
  row.append(reset);

  const help = document.createElement("small");
  help.textContent = "Ссылка сохранится только для этой песни. Автоматические совпадения больше не заменят выбранный текст.";
  form.append(label, row, help);
  return form;
}

async function loadManualSource() {
  const input = elements?.correction.querySelector(".manual-url");
  const url = input?.value.trim() ?? "";
  if (!url) {
    input?.setCustomValidity("Вставьте ссылку на страницу песни Genius.");
    input?.reportValidity();
    return;
  }

  const track = state.track;
  const trackKey = state.trackKey;
  const requestId = ++state.requestId;
  state.status = "loading";
  state.error = "";
  render();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "lyrics:from-url",
      track,
      url,
    });
    if (requestId !== state.requestId || trackKey !== state.trackKey) return;
    applyLyricsResponse(response);
    if (state.status === "ready") {
      const savedUrl = response.sourceUrl || url;
      await saveManualSource(trackKey, savedUrl);
      state.manualSourceUrl = savedUrl;
      state.correctionOpen = false;
    }
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.message : "Не удалось загрузить ссылку.";
  }
  render();
}

async function deleteManualSource() {
  const track = state.track;
  const trackKey = state.trackKey;
  if (!track || !trackKey) return;
  const stored = await chrome.storage.local.get({ [MANUAL_SOURCES_KEY]: {} });
  const next = { ...stored[MANUAL_SOURCES_KEY] };
  delete next[trackKey];
  await chrome.storage.local.set({ [MANUAL_SOURCES_KEY]: next });
  state.manualSourceUrl = "";
  state.correctionOpen = false;
  await loadLyrics(track, true);
}

async function saveManualSource(trackKey, url) {
  const stored = await chrome.storage.local.get({ [MANUAL_SOURCES_KEY]: {} });
  await chrome.storage.local.set({
    [MANUAL_SOURCES_KEY]: {
      ...stored[MANUAL_SOURCES_KEY],
      [trackKey]: url,
    },
  });
}

function openSyncEditor() {
  if (state.status !== "ready" || !state.lyrics.length) return;
  state.editorOpen = true;
  state.panelOpen = false;
  state.fullscreen = false;
  state.editorTimes = state.lyrics.map((_, index) =>
    state.syncMode === "timed" && Number.isFinite(state.lyricTimings[index])
      ? state.lyricTimings[index]
      : null,
  );
  state.editorIndex = firstSyncableIndex();
  state.editorMessage = "";
  render();
}

function renderEditor() {
  if (!elements?.editorBody) return;
  elements.editorBody.replaceChildren();
  if (!state.editorOpen) return;

  const introduction = document.createElement("p");
  introduction.className = "editor-intro";
  introduction.textContent =
    "Выберите автоматический анализ аудиофайла, импортируйте LRC или отметьте строки вручную.";

  const autoSection = document.createElement("section");
  autoSection.className = "editor-section auto-sync-section";
  const autoTitle = document.createElement("strong");
  autoTitle.textContent = "Автоматически — аудиофайл + готовый текст";
  const autoCopy = document.createElement("p");
  autoCopy.className = "editor-section-copy";
  autoCopy.textContent =
    "Выберите файл песни: локальная модель распознает слова и расставит строки по времени. API-ключ не нужен.";
  const autoActions = document.createElement("div");
  autoActions.className = "editor-actions";
  autoActions.append(actionButton("auto-sync", "Открыть автосинхронизацию ↗", true));
  autoSection.append(autoTitle, autoCopy, autoActions);

  const importSection = document.createElement("section");
  importSection.className = "editor-section";
  const importTitle = document.createElement("strong");
  importTitle.textContent = "Вариант 1 — импорт LRC";
  const textarea = document.createElement("textarea");
  textarea.className = "lrc-input";
  textarea.rows = 6;
  textarea.spellcheck = false;
  textarea.placeholder = "[00:12.40] Первая строка\n[00:16.20] Вторая строка";
  if (state.syncMode === "timed") textarea.value = buildCurrentLrc();

  const importActions = document.createElement("div");
  importActions.className = "editor-actions";
  const importButton = actionButton("import-lrc", "Импортировать и сохранить", true);
  const fileLabel = document.createElement("label");
  fileLabel.className = "file-button";
  fileLabel.textContent = "Открыть .lrc";
  const fileInput = document.createElement("input");
  fileInput.className = "lrc-file";
  fileInput.type = "file";
  fileInput.accept = ".lrc,text/plain";
  fileLabel.append(fileInput);
  const generator = document.createElement("a");
  generator.href = "https://lrcgenerator.com/";
  generator.target = "_blank";
  generator.rel = "noreferrer";
  generator.textContent = "LRC Generator ↗";
  importActions.append(importButton, fileLabel, generator);
  importSection.append(importTitle, textarea, importActions);

  const tapSection = document.createElement("section");
  tapSection.className = "editor-section tap-section";
  const tapTitle = document.createElement("strong");
  tapTitle.textContent = "Вариант 2 — расставить здесь";
  const syncable = syncableIndexes();
  const position = syncable.indexOf(state.editorIndex);
  const progress = document.createElement("span");
  progress.className = "editor-progress";
  progress.textContent = state.editorIndex >= 0
    ? `Строка ${position + 1} из ${syncable.length}`
    : "Все строки отмечены";
  const current = document.createElement("p");
  current.className = "editor-current-line";
  current.textContent = state.editorIndex >= 0
    ? state.lyrics[state.editorIndex]
    : "Готово — сохраните метки.";

  const clock = document.createElement("span");
  clock.className = "editor-clock";
  clock.textContent = formatTimePrecise(readPlaybackState()?.currentTime ?? 0);

  const tapActions = document.createElement("div");
  tapActions.className = "editor-actions";
  const stamp = actionButton("stamp-line", "Поставить метку · Space", true);
  stamp.disabled = state.editorIndex < 0;
  tapActions.append(
    stamp,
    actionButton("previous-line", "Назад"),
    actionButton("reset-timing", "Сбросить"),
    actionButton("save-timing", "Сохранить"),
  );
  if (state.lyricsProvider === "Local LRC") {
    tapActions.append(actionButton("delete-manual-timing", "Удалить мои метки"));
  }
  tapSection.append(tapTitle, progress, current, clock, tapActions);

  if (state.editorMessage) {
    const message = document.createElement("p");
    message.className = "editor-message";
    message.textContent = state.editorMessage;
    tapSection.append(message);
  }

  elements.editorBody.append(introduction, autoSection, importSection, tapSection);
}

async function openAutoSync() {
  if (!state.trackKey || !state.track) return;
  await chrome.storage.local.set({
    [AUTO_SYNC_DRAFT_KEY]: {
      trackKey: state.trackKey,
      title: state.track.title ?? "",
      artist: state.track.artist ?? "",
      lyrics: state.lyrics.join("\n"),
      sourceUrl: state.sourceUrl,
      soundcloudUrl: location.href,
      createdAt: Date.now(),
    },
  });
  const response = await chrome.runtime.sendMessage({ type: "auto-sync:open" });
  if (!response?.ok) {
    state.editorMessage = response?.error || "Не удалось открыть автосинхронизацию.";
    renderEditor();
  }
}

function actionButton(action, label, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  if (primary) button.className = "is-primary";
  return button;
}

function syncableIndexes() {
  return state.lyrics
    .map((line, index) => (/^\[.+]$/.test(line) ? -1 : index))
    .filter((index) => index >= 0);
}

function firstSyncableIndex() {
  const indexes = syncableIndexes();
  return indexes.find((index) => !Number.isFinite(state.editorTimes[index])) ?? indexes[0] ?? -1;
}

function stampCurrentLine() {
  if (!state.editorOpen || state.editorIndex < 0) return;
  const playback = readPlaybackState();
  if (!playback) {
    state.editorMessage = "Сначала включите песню в SoundCloud.";
    renderEditor();
    return;
  }

  state.editorTimes[state.editorIndex] = playback.currentTime;
  const indexes = syncableIndexes();
  const position = indexes.indexOf(state.editorIndex);
  state.editorIndex = indexes[position + 1] ?? -1;
  state.editorMessage = state.editorIndex < 0 ? "Все строки отмечены. Нажмите «Сохранить»." : "";
  renderEditor();
}

function moveEditorBack() {
  const indexes = syncableIndexes();
  const position = state.editorIndex < 0 ? indexes.length : indexes.indexOf(state.editorIndex);
  state.editorIndex = indexes[Math.max(0, position - 1)] ?? -1;
  state.editorMessage = "";
  renderEditor();
}

function resetEditorTiming() {
  state.editorTimes = state.lyrics.map(() => null);
  state.editorIndex = firstSyncableIndex();
  state.editorMessage = "";
  renderEditor();
}

async function saveEditorTiming() {
  const indexes = syncableIndexes();
  const missing = indexes.filter((index) => !Number.isFinite(state.editorTimes[index]));
  if (missing.length) {
    state.editorMessage = `Осталось отметить строк: ${missing.length}.`;
    renderEditor();
    return;
  }

  const timedLyrics = indexes.map((index) => ({
    time: state.editorTimes[index],
    text: state.lyrics[index],
  }));
  if (!timestampsAreOrdered(timedLyrics)) {
    state.editorMessage = "Метки идут не по порядку. Вернитесь к неверной строке и отметьте её заново.";
    renderEditor();
    return;
  }
  await saveManualLyrics(timedLyrics);
}

async function importLrcFromEditor() {
  const value = elements?.editorBody.querySelector(".lrc-input")?.value ?? "";
  const timedLyrics = parseLrcInput(value);
  if (timedLyrics.length < 2) {
    state.editorMessage = "Не найдено хотя бы двух строк с метками [мм:сс.xx].";
    renderEditor();
    return;
  }
  await saveManualLyrics(timedLyrics);
}

async function saveManualLyrics(timedLyrics) {
  const trackKey = state.trackKey;
  const stored = await chrome.storage.local.get({ [MANUAL_LYRICS_KEY]: {} });
  await chrome.storage.local.set({
    [MANUAL_LYRICS_KEY]: {
      ...stored[MANUAL_LYRICS_KEY],
      [trackKey]: { timedLyrics, sourceUrl: state.sourceUrl, updatedAt: Date.now() },
    },
  });

  state.editorOpen = false;
  applyLyricsResponse({
    ok: true,
    timedLyrics,
    lyricsProvider: "Local LRC",
    sourceUrl: state.sourceUrl,
    match: state.match,
  });
  render();
}

async function deleteManualTiming() {
  const stored = await chrome.storage.local.get({ [MANUAL_LYRICS_KEY]: {} });
  const next = { ...stored[MANUAL_LYRICS_KEY] };
  delete next[state.trackKey];
  await chrome.storage.local.set({ [MANUAL_LYRICS_KEY]: next });
  state.editorOpen = false;
  await loadLyrics(state.track);
}

function parseLrcInput(value = "") {
  const offsetMatch = value.match(/^\[offset:([+-]?\d+)]/im);
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const parsed = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g)];
    const text = cleanText(
      rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g, ""),
    );
    if (!timestamps.length || !text) continue;
    for (const timestamp of timestamps) {
      const fraction = Number((timestamp[3] ?? "0").padEnd(3, "0").slice(0, 3)) / 1000;
      parsed.push({
        time: Math.max(0, Number(timestamp[1]) * 60 + Number(timestamp[2]) + fraction + offset),
        text,
      });
    }
  }
  parsed.sort((left, right) => left.time - right.time);
  return parsed;
}

function timestampsAreOrdered(lines) {
  return lines.every((line, index) => index === 0 || line.time >= lines[index - 1].time);
}

function buildCurrentLrc() {
  return state.lyrics
    .map((line, index) =>
      Number.isFinite(state.lyricTimings[index])
        ? `[${formatTimePrecise(state.lyricTimings[index])}]${line}`
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

function updateEditorClock() {
  if (!state.editorOpen) return;
  const clock = elements?.editorBody.querySelector(".editor-clock");
  const playback = readPlaybackState();
  if (clock && playback) clock.textContent = formatTimePrecise(playback.currentTime);
}

function statusView(title, message) {
  const view = document.createElement("div");
  view.className = "status-view";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const copy = document.createElement("span");
  copy.textContent = message;
  view.append(heading, copy);
  return view;
}

function updateProgress() {
  if (state.syncMode !== "timed" || state.status !== "ready" || !state.lyricTimings.length) return;
  const playback = readPlaybackState();
  if (!playback) return;

  let nextLine = -1;
  for (let index = 0; index < state.lyricTimings.length; index += 1) {
    if (state.lyricTimings[index] > playback.currentTime + 0.08) break;
    nextLine = index;
  }
  if (nextLine === state.activeLine) return;
  state.activeLine = nextLine;
  applyActiveLine(true);
}

function applyActiveLine(shouldScroll) {
  if (!elements) return;
  for (const container of [elements.panelBody, elements.fullscreenBody]) {
    container.querySelectorAll(".lyric-line").forEach((line) => {
      const index = Number(line.dataset.line);
      line.classList.toggle("is-active", state.activeLine >= 0 && index === state.activeLine);
      line.classList.toggle("is-past", state.activeLine >= 0 && index < state.activeLine);
    });
  }

  if (!shouldScroll || state.activeLine < 0) return;
  const visibleContainer = state.fullscreen ? elements.fullscreenBody : state.panelOpen ? elements.panelBody : null;
  const activeElement = visibleContainer?.querySelector(`[data-line='${state.activeLine}']`);
  if (!visibleContainer || !activeElement) return;

  const containerBounds = visibleContainer.getBoundingClientRect();
  const lineBounds = activeElement.getBoundingClientRect();
  const top =
    visibleContainer.scrollTop +
    lineBounds.top -
    containerBounds.top -
    visibleContainer.clientHeight / 2 +
    lineBounds.height / 2;
  visibleContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function seekToLyric(lineIndex) {
  if (state.syncMode !== "timed") return;
  const targetTime = state.lyricTimings[lineIndex];
  const playback = readPlaybackState();
  if (!Number.isFinite(targetTime) || !playback?.duration) return;
  if (!seekPlayback(targetTime / playback.duration)) return;

  state.activeLine = lineIndex;
  applyActiveLine(true);
}

function seekPlayback(progress) {
  const audio = findPlayableAudio();
  if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
    try {
      audio.currentTime = clamp(progress) * audio.duration;
      return true;
    } catch {
      // Fall through to SoundCloud's timeline control.
    }
  }

  const timeline = findTimelineControl();
  if (!timeline) return false;
  const bounds = timeline.getBoundingClientRect();
  if (!bounds.width) return false;
  const clientX = bounds.left + bounds.width * clamp(progress);
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY: bounds.top + bounds.height / 2,
  };
  timeline.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
  timeline.dispatchEvent(new PointerEvent("pointerup", eventOptions));
  timeline.dispatchEvent(new MouseEvent("click", eventOptions));
  return true;
}

function readPlaybackState() {
  const audio = findPlayableAudio();
  if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
    return {
      currentTime: audio.currentTime,
      duration: audio.duration,
      progress: clamp(audio.currentTime / audio.duration),
    };
  }

  const timeline = findTimelineControl();
  const valueNow = Number(timeline?.getAttribute("aria-valuenow"));
  const valueMax = Number(timeline?.getAttribute("aria-valuemax"));
  if (Number.isFinite(valueNow) && Number.isFinite(valueMax) && valueMax > 0) {
    return { currentTime: valueNow, duration: valueMax, progress: clamp(valueNow / valueMax) };
  }

  const elapsed = parseTime(
    firstText([
      ".playbackTimeline__timePassed span",
      ".playbackTimeline__timePassed",
      "[data-testid='playback-position']",
      "[data-testid='playback-time-passed']",
    ]),
  );
  const duration = parseTime(
    firstText([
      ".playbackTimeline__duration span",
      ".playbackTimeline__duration",
      "[data-testid='playback-duration']",
    ]),
  );
  if (duration > 0) return { currentTime: elapsed, duration, progress: clamp(elapsed / duration) };

  const progressElement = document.querySelector(
    ".playbackTimeline__progressHandle, .playbackTimeline__progress, [data-testid='playback-progress']",
  );
  const percentage = Number.parseFloat(progressElement?.style.left || progressElement?.style.width || "");
  return Number.isFinite(percentage)
    ? { currentTime: percentage, duration: 100, progress: clamp(percentage / 100) }
    : null;
}

function findPlayableAudio() {
  const audios = [...document.querySelectorAll("audio")];
  return (
    audios.find((item) => !item.paused && Number.isFinite(item.duration) && item.duration > 0) ||
    audios.find((item) => Number.isFinite(item.duration) && item.duration > 0) ||
    null
  );
}

function findTimelineControl() {
  return document.querySelector(
    ".playbackTimeline__progressWrapper, [data-testid='playback-timeline'], .playbackTimeline [role='slider'], .playControls [role='slider'][aria-valuemax]",
  );
}

function firstText(selectors) {
  for (const selector of selectors) {
    const value = cleanText(document.querySelector(selector)?.textContent);
    if (value) return value;
  }
  return "";
}

function firstImageSource(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;
    if (element instanceof HTMLImageElement && element.currentSrc) return element.currentSrc;
    const background = getComputedStyle(element).backgroundImage;
    const match = background.match(/^url\(["']?(.*?)["']?\)$/);
    if (match?.[1]) return match[1];
  }
  return "";
}

function parseTime(value) {
  const parts = value.split(":").map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatTimePrecise(value) {
  const total = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const hundredths = Math.floor((total % 1) * 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function cleanText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function cssUrl(value) {
  return value.replace(/["\\\n\r]/g, (character) => `\\${character}`);
}

function upgradeArtworkUrl(value = "") {
  if (!value) return "";
  try {
    const url = new URL(value, location.href);
    if (/sndcdn\.com$/i.test(url.hostname)) {
      url.pathname = url.pathname.replace(
        /-(?:tiny|small|badge|t\d+x\d+|large|crop|original)(?=\.[a-z0-9]+$)/i,
        "-t1080x1080",
      );
    }
    return url.href;
  } catch {
    return value;
  }
}
