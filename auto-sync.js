import { alignLyricsToTranscript, formatTimeInput, parseTimeInput } from "./alignment-utils.mjs";

const AUTO_SYNC_DRAFT_KEY = "autoSyncDraft";
const MANUAL_LYRICS_KEY = "manualLyricsByTrack";
const elements = {
  title: document.querySelector("#track-title"),
  artist: document.querySelector("#track-artist"),
  soundcloudLink: document.querySelector("#soundcloud-link"),
  file: document.querySelector("#audio-file"),
  fileName: document.querySelector("#file-name"),
  language: document.querySelector("#language"),
  lyrics: document.querySelector("#lyrics-input"),
  lineCount: document.querySelector("#line-count"),
  analyze: document.querySelector("#analyze-button"),
  progressSection: document.querySelector("#progress-section"),
  progressTitle: document.querySelector("#progress-title"),
  progressDetail: document.querySelector("#progress-detail"),
  progressBar: document.querySelector("#progress-bar"),
  resultsSection: document.querySelector("#results-section"),
  confidence: document.querySelector("#confidence"),
  resultList: document.querySelector("#result-list"),
  reanalyze: document.querySelector("#reanalyze-button"),
  save: document.querySelector("#save-button"),
  message: document.querySelector("#message"),
};

let draft;
let currentResult;
let pendingAnalysis;
const worker = new Worker("auto-sync-worker.js", { type: "module" });

worker.addEventListener("message", handleWorkerMessage);
elements.file.addEventListener("change", handleFileChange);
elements.lyrics.addEventListener("input", updateLineCount);
elements.analyze.addEventListener("click", () => void analyze());
elements.reanalyze.addEventListener("click", () => void analyze());
elements.save.addEventListener("click", () => void save());

void initialize();

async function initialize() {
  const stored = await chrome.storage.local.get({ [AUTO_SYNC_DRAFT_KEY]: null });
  draft = stored[AUTO_SYNC_DRAFT_KEY];
  if (!draft?.trackKey) {
    showMessage("Сначала откройте трек в SoundCloud и выберите «+ Метки».", true);
    elements.analyze.disabled = true;
    return;
  }

  elements.title.textContent = draft.title || "Без названия";
  elements.artist.textContent = draft.artist || "Неизвестный исполнитель";
  elements.lyrics.value = draft.lyrics || "";
  if (draft.soundcloudUrl) elements.soundcloudLink.href = draft.soundcloudUrl;
  updateLineCount();
}

function handleFileChange() {
  const file = elements.file.files?.[0];
  elements.fileName.textContent = file
    ? `${shortFilename(file.name)} · ${formatFileSize(file.size)}`
    : "MP3, WAV, M4A, FLAC, OGG или WebM";
  showMessage("");
}

function updateLineCount() {
  const count = lyricLines().length;
  elements.lineCount.textContent = `${count} ${russianPlural(count, "строка", "строки", "строк")}`;
}

async function analyze() {
  const file = elements.file.files?.[0];
  const lines = lyricLines();
  if (!file) {
    showMessage("Сначала выберите аудиофайл песни.", true);
    return;
  }
  if (lines.length < 2) {
    showMessage("Нужно хотя бы две строки готового текста.", true);
    return;
  }

  try {
    setBusy(true);
    currentResult = undefined;
    elements.resultsSection.hidden = true;
    elements.progressSection.hidden = false;
    setProgress(4, "Подготавливаю аудио…", "Преобразую файл для локального распознавания");
    const decoded = await decodeToMono16k(file);
    setProgress(8, "Запускаю Whisper…", "При первом запуске загружается модель");
    pendingAnalysis = { lines, duration: decoded.duration };
    worker.postMessage({
      type: "analyze",
      audio: decoded.samples,
      language: elements.language.value,
    }, [decoded.samples.buffer]);
  } catch (error) {
    pendingAnalysis = undefined;
    setBusy(false);
    elements.progressSection.hidden = true;
    showMessage(error instanceof Error ? error.message : "Не удалось прочитать аудиофайл.", true);
  }
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (message?.type === "progress") {
    const percent = Number.isFinite(message.progress) ? Math.max(8, Math.min(75, message.progress * 0.67 + 8)) : 12;
    const filename = message.file ? shortFilename(message.file) : "Файлы модели";
    setProgress(percent, "Загружаю модель…", filename);
    return;
  }
  if (message?.type === "stage") {
    setProgress(82, message.title, message.detail);
    return;
  }
  if (message?.type === "error") {
    pendingAnalysis = undefined;
    setBusy(false);
    elements.progressSection.hidden = true;
    showMessage(`Распознавание не завершено: ${message.error}`, true);
    return;
  }
  if (message?.type !== "complete" || !pendingAnalysis) return;

  try {
    setProgress(94, "Сопоставляю строки…", "Сверяю готовый текст с распознанными словами");
    currentResult = alignLyricsToTranscript(
      pendingAnalysis.lines,
      message.chunks,
      pendingAnalysis.duration,
    );
    renderResults(currentResult);
    setProgress(100, "Готово", "Проверьте метки перед сохранением");
    window.setTimeout(() => { elements.progressSection.hidden = true; }, 350);
    showMessage("");
  } catch (error) {
    elements.progressSection.hidden = true;
    showMessage(error instanceof Error ? error.message : "Не удалось сопоставить строки.", true);
  } finally {
    pendingAnalysis = undefined;
    setBusy(false);
  }
}

function renderResults(result) {
  elements.resultList.replaceChildren();
  result.timedLyrics.forEach((line, index) => {
    const row = document.createElement("label");
    row.className = "result-row";
    const number = document.createElement("span");
    number.className = "result-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const time = document.createElement("input");
    time.className = "time-input";
    time.type = "text";
    time.inputMode = "decimal";
    time.value = formatTimeInput(line.time);
    time.dataset.index = String(index);
    time.setAttribute("aria-label", `Время строки ${index + 1}`);
    const text = document.createElement("span");
    text.className = "result-text";
    text.textContent = line.text;
    row.append(number, time, text);
    elements.resultList.append(row);
  });

  const percent = Math.round(result.confidence * 100);
  elements.confidence.textContent = percent >= 65
    ? `Совпадение ${percent}%`
    : `Нужно проверить · ${percent}%`;
  elements.confidence.classList.toggle("is-low", percent < 65);
  elements.resultsSection.hidden = false;
  elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function save() {
  if (!draft?.trackKey || !currentResult) return;
  const inputs = [...elements.resultList.querySelectorAll(".time-input")];
  const times = inputs.map((input) => parseTimeInput(input.value));
  if (times.some((time) => !Number.isFinite(time))) {
    showMessage("Проверьте формат времени: используйте мм:сс.xx.", true);
    return;
  }
  if (times.some((time, index) => index > 0 && time < times[index - 1])) {
    showMessage("Метки должны идти по порядку, от начала песни к концу.", true);
    return;
  }

  const timedLyrics = currentResult.timedLyrics.map((line, index) => ({
    time: times[index],
    text: line.text,
  }));
  const stored = await chrome.storage.local.get({ [MANUAL_LYRICS_KEY]: {} });
  await chrome.storage.local.set({
    [MANUAL_LYRICS_KEY]: {
      ...stored[MANUAL_LYRICS_KEY],
      [draft.trackKey]: {
        timedLyrics,
        sourceUrl: draft.sourceUrl || "",
        autoGenerated: true,
        updatedAt: Date.now(),
      },
    },
  });
  showMessage("Сохранено. Вернитесь в SoundCloud — текст обновится автоматически.");
  elements.save.textContent = "Сохранено ✓";
}

async function decodeToMono16k(file) {
  const bytes = await file.arrayBuffer();
  const context = new AudioContext();
  try {
    const source = await context.decodeAudioData(bytes.slice(0));
    const frameCount = Math.ceil(source.duration * 16000);
    const offline = new OfflineAudioContext(1, frameCount, 16000);
    const bufferSource = offline.createBufferSource();
    bufferSource.buffer = source;
    bufferSource.connect(offline.destination);
    bufferSource.start();
    const rendered = await offline.startRendering();
    return {
      samples: new Float32Array(rendered.getChannelData(0)),
      duration: rendered.duration,
    };
  } catch (error) {
    throw new Error(`Chrome не смог прочитать этот аудиофайл: ${error.message}`);
  } finally {
    await context.close();
  }
}

function lyricLines() {
  return elements.lyrics.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[.+]$/.test(line));
}

function setBusy(busy) {
  elements.analyze.disabled = busy;
  elements.reanalyze.disabled = busy;
  elements.save.disabled = busy;
  elements.analyze.textContent = busy ? "Анализирую…" : "Распознать и расставить метки";
}

function setProgress(percent, title, detail) {
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  elements.progressTitle.textContent = title;
  elements.progressDetail.textContent = detail;
}

function showMessage(text, error = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle("is-error", error);
}

function shortFilename(value) {
  const name = String(value).split(/[\\/]/).at(-1) || "";
  return name.length > 44 ? `${name.slice(0, 20)}…${name.slice(-20)}` : name;
}

function formatFileSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function russianPlural(number, one, few, many) {
  const modulo100 = number % 100;
  const modulo10 = number % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return many;
  if (modulo10 === 1) return one;
  if (modulo10 >= 2 && modulo10 <= 4) return few;
  return many;
}
