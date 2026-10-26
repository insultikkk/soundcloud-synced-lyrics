import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extensionDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(extensionDirectory, ".qa");
await mkdir(outputDirectory, { recursive: true });

const css = await readFile(join(extensionDirectory, "styles.css"), "utf8");
const stylesheetUrl = `data:text/css;base64,${Buffer.from(css).toString("base64")}`;
const artwork = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="#0a96ce"/>
    <path d="M0 580L800 360V800H0Z" fill="#07537d"/>
    <circle cx="570" cy="405" r="62" fill="#101010"/>
    <path d="M540 465h60l45 230H490Z" fill="#101010"/>
    <text x="80" y="690" fill="white" font-size="150" font-family="Arial" transform="rotate(-90 80 690)">KCD2A</text>
  </svg>
`)}`;

const lyricsHtml = `
  <div data-lyrics-container="true">
    [Verse 1]<br>
    Sunday, wake up<br>
    Sunday, wake up, give me a cigarette<br>
    Sunday, wake up<br>
    Sunday, wake up, give me a cigarette<br>
    Время шесть утра, я не хочу спать<br>
    Что-то поменять — кто, если не я?
  </div>
`;

const plainLyricsHtml = `
  <div data-lyrics-container="true">
    11 ContributorsTranslationsEnglishunder armour Lyrics[Текст песни «under armour»]<br>
    Первая обычная строка<br>
    Вторая обычная строка
  </div>
`;

const timedLyrics = [
  { time: 0, text: "[Verse 1]" },
  { time: 5, text: "Sunday, wake up" },
  { time: 30, text: "Sunday, wake up, give me a cigarette" },
  { time: 50, text: "Sunday, wake up" },
  { time: 70, text: "Sunday, wake up, give me a cigarette" },
  { time: 100, text: "Время шесть утра, я не хочу спать" },
  { time: 140, text: "Что-то поменять — кто, если не я?" },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});

try {
  const page = await browser.newPage({ viewport: { width: 1590, height: 910 } });
  await page.setContent(`
    <!doctype html>
    <html>
      <head><style>
        body { margin: 0; min-height: 100vh; color: #ddd; background: #111; font-family: Arial, sans-serif; }
        nav { height: 44px; padding: 0 26px; display: flex; align-items: center; gap: 34px; background: #181818; }
        main { padding: 40px 28px 100px; }
        .cards { display: grid; grid-template-columns: repeat(6, 180px); gap: 26px; }
        .cards i { display: block; height: 180px; background: #252525; }
        .playControls { position: fixed; inset: auto 0 0; height: 48px; display: flex; align-items: center; gap: 20px; padding: 0 28px; background: #303030; z-index: 2147483640; }
      </style></head>
      <body>
        <nav><strong>SoundCloud</strong><span>Home</span><span>Feed</span><span>Library</span></nav>
        <main><h1>Likes</h1><div class="cards">${"<i></i>".repeat(18)}</div></main>
        <div class="playControls">
          <button>▶</button>
          <span class="playbackTimeline__timePassed"><span>0:42</span></span>
          <span>━━━━━━━━━━━━━━━━━━━━</span>
          <span class="playbackTimeline__duration"><span>2:53</span></span>
          <a class="playbackSoundBadge__lightLink">ONDA ANDAR</a>
          <a class="playbackSoundBadge__titleLink"><span aria-hidden="true">sleep mode</span></a>
          <span class="playbackSoundBadge__avatar" style="background-image:url('${artwork}')"></span>
        </div>
        <audio></audio>
      </body>
    </html>
  `);

  await page.evaluate(
    ({ stylesheetUrl, lyricsHtml, plainLyricsHtml, timedLyrics, artwork }) => {
      const storageData = {};
      window.chrome = {
        storage: {
          local: {
            get: async (defaults) => ({ ...defaults, ...storageData }),
            set: async (values) => Object.assign(storageData, values),
          },
          onChanged: { addListener: () => undefined },
        },
        runtime: {
          getURL: () => stylesheetUrl,
          sendMessage: async ({ type, track }) => {
            window.__lyricsMessages ??= [];
            window.__lyricsMessages.push({ type, title: track.title });
            return track.title === "missing song"
              ? type === "lyrics:from-url"
                ? {
                    ok: true,
                    html: lyricsHtml,
                    lyricsProvider: "Genius",
                    sourceUrl: "https://genius.com/manual-song-lyrics",
                    match: null,
                  }
                : {
                    ok: false,
                    error: "Текст не найден.",
                    searchUrl: "https://genius.com/search?q=missing",
                  }
              : track.title === "plain song"
              ? {
                  ok: true,
                  html: plainLyricsHtml,
                  lyricsProvider: "Genius",
                  sourceUrl: "https://genius.com/plain-song-lyrics",
                  searchUrl: "https://genius.com/search?q=plain%20song",
                  match: { title: "plain song", artist: "ONDA ANDAR", artwork },
                }
              : {
                  ok: true,
                  html: lyricsHtml,
                  timedLyrics,
                  lyricsProvider: "LRCLIB",
                  syncSourceUrl: "https://lrclib.net/api/get/1",
                  sourceUrl: "https://genius.com/example-lyrics",
                  searchUrl: "https://genius.com/search?q=example",
                  match: { title: "sleep mode", artist: "ONDA ANDAR", artwork },
                };
          },
        },
      };
      const audio = document.querySelector("audio");
      Object.defineProperty(audio, "duration", { value: 173, configurable: true, writable: true });
      Object.defineProperty(audio, "currentTime", { value: 42, configurable: true, writable: true });
      Object.defineProperty(audio, "paused", { value: false, configurable: true });
    },
    { stylesheetUrl, lyricsHtml, plainLyricsHtml, timedLyrics, artwork },
  );

  await page.addScriptTag({ path: join(extensionDirectory, "content.js") });
  const launcher = page.locator(".lyrics-launcher");
  await launcher.waitFor();
  await launcher.click();
  await page.locator(".lyrics-panel.is-open").waitFor();
  await page.locator(".panel-body .lyric-line").first().waitFor();
  assert.equal(await page.locator(".panel-body .lyric-line").count(), 7);
  assert.equal(await page.locator(".panel-title").textContent(), "sleep mode");
  await page.locator(".panel-body .lyric-line.is-active").waitFor();
  assert.equal(
    await page.locator(".panel-body .lyric-line.is-active").textContent(),
    "Sunday, wake up, give me a cigarette",
    "The active line follows its real timestamp",
  );

  await page.locator(".panel-body .lyric-line:not(.is-section)").last().click();
  await page.waitForFunction(() => document.querySelector("audio").currentTime >= 140);
  assert.ok(
    await page.locator(".panel-body .lyric-line:not(.is-section)").last().evaluate((line) => line.classList.contains("is-active")),
    "Clicking a lyric seeks the track and activates that line",
  );
  await page.waitForFunction(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    return root?.shadowRoot?.querySelector(".panel-body")?.scrollTop > 0;
  });

  await page.evaluate(() => {
    document.querySelector("audio").duration = Number.NaN;
    document.querySelector(".playbackTimeline__timePassed span").textContent = "0:05";
  });
  await page.locator(".panel-body .lyric-line:not(.is-section)").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    return root?.shadowRoot?.querySelector(".panel-body .lyric-line:not(.is-section)")?.classList.contains("is-active");
  });
  await page.evaluate(() => {
    document.querySelector(".playbackTimeline__timePassed span").textContent = "2:45";
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    const lines = root?.shadowRoot?.querySelectorAll(".panel-body .lyric-line:not(.is-section)");
    return lines?.[lines.length - 1]?.classList.contains("is-active");
  });
  await page.screenshot({ path: join(outputDirectory, "panel.png"), fullPage: true });

  await page.evaluate(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    root.shadowRoot.querySelector(".panel-title").textContent =
      "BLOODY DOUBTS — VERY LONG TRACK TITLE (w/o slowed version)";
  });
  const panelBox = await page.locator(".lyrics-panel").boundingBox();
  const headerActionBox = await page.locator("[data-action='close']").boundingBox();
  assert.ok(
    panelBox && headerActionBox && headerActionBox.x + headerActionBox.width <= panelBox.x + panelBox.width,
    "Long titles do not push header actions outside the panel",
  );
  await page.screenshot({ path: join(outputDirectory, "panel-long-title.png"), fullPage: true });

  await page.locator("[data-action='toggle-source']").click();
  await page.locator(".source-correction:not([hidden])").waitFor();
  assert.ok(await page.locator(".manual-url").isVisible());
  assert.ok(await page.locator("[data-action='reset-manual-source']").isVisible());
  await page.screenshot({ path: join(outputDirectory, "source-correction.png"), fullPage: true });
  await page.locator("[data-action='toggle-source']").click();

  await page.locator("[data-action='fullscreen']").click();
  await page.locator(".lyrics-fullscreen.is-open").waitFor();
  await page.waitForTimeout(220);
  assert.ok(await page.locator(".fullscreen-artwork").isVisible());
  assert.equal(await page.locator(".fullscreen-body .lyric-line").count(), 7);
  await page.screenshot({ path: join(outputDirectory, "fullscreen.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(!(await page.locator(".artwork-frame").isVisible()), "Artwork is hidden on narrow screens");
  const fullscreenBox = await page.locator(".lyrics-fullscreen").boundingBox();
  assert.ok(fullscreenBox && fullscreenBox.width <= 390, "Fullscreen view fits a narrow viewport");
  await page.screenshot({ path: join(outputDirectory, "fullscreen-mobile.png"), fullPage: true });

  await page.setViewportSize({ width: 1590, height: 910 });
  await page.locator("[data-action='exit-fullscreen']").click();
  await page.evaluate(() => {
    document.querySelector(".playbackSoundBadge__titleLink span").textContent = "plain song";
    document.querySelector(".playbackTimeline__timePassed span").textContent = "1:40";
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    return root?.shadowRoot?.querySelector(".panel-title")?.textContent === "plain song";
  });
  await page.locator(".lyrics-launcher").click();
  await page.locator(".panel-body .lyric-line").first().waitFor();
  assert.equal(await page.locator(".panel-body .lyric-line").count(), 2, "Genius interface junk is removed");
  await page.waitForTimeout(500);
  assert.equal(
    await page.locator(".panel-body .lyric-line.is-active").count(),
    0,
    "Plain lyrics do not use fake proportional tracking",
  );
  assert.match(await page.locator(".sync-note").textContent(), /нет временных меток/);

  await page.locator("[data-action='sync-editor']").click();
  await page.locator(".lyrics-editor.is-open").waitFor();
  await page.screenshot({ path: join(outputDirectory, "lyrics-editor.png"), fullPage: true });
  await page.locator(".lrc-input").fill(
    "[00:05.00] Первая обычная строка\n[00:20.00] Вторая обычная строка",
  );
  await page.locator("[data-action='import-lrc']").click();
  await page.locator(".lyrics-editor").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".panel-body .lyric-line").count(), 2);
  assert.match(await page.locator(".sync-note").textContent(), /Синхронизировано/);
  assert.equal(
    await page.evaluate(() => Boolean(window.chrome)),
    true,
    "Chrome mock remains available after saving local LRC",
  );

  await page.locator(".lyrics-launcher").click();
  await page.locator("[data-action='sync-editor']").click();
  await page.locator("[data-action='reset-timing']").click();
  await page.evaluate(() => {
    document.querySelector(".playbackTimeline__timePassed span").textContent = "0:05";
  });
  await page.locator("[data-action='stamp-line']").click();
  await page.evaluate(() => {
    document.querySelector(".playbackTimeline__timePassed span").textContent = "0:20";
  });
  await page.locator("[data-action='stamp-line']").click();
  await page.locator("[data-action='save-timing']").click();
  await page.locator(".lyrics-editor").waitFor({ state: "hidden" });

  await page.evaluate(() => {
    document.querySelector(".playbackSoundBadge__titleLink span").textContent = "missing song";
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    return root?.shadowRoot?.querySelector(".manual-url");
  });
  await page.locator(".lyrics-launcher").click();
  await page.locator(".manual-url").fill("https://genius.com/manual-song-lyrics");
  await page.locator("[data-action='load-manual-url']").click();
  await page.locator(".panel-body .lyric-line").first().waitFor();
  assert.equal(await page.locator(".panel-body .lyric-line").count(), 7);
  assert.equal(
    await page.locator(".panel-source").getAttribute("href"),
    "https://genius.com/manual-song-lyrics",
  );

  await page.evaluate(() => {
    document.querySelector(".playbackSoundBadge__titleLink span").textContent = "plain song";
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("#sc-genius-companion-root");
    return root?.shadowRoot?.querySelector(".panel-title")?.textContent === "plain song";
  });
  await page.evaluate(() => {
    document.querySelector(".playbackSoundBadge__titleLink span").textContent = "missing song";
  });
  await page.waitForFunction(() => {
    const messages = window.__lyricsMessages ?? [];
    const last = messages.at(-1);
    return last?.title === "missing song" && last?.type === "lyrics:from-url";
  });

  console.log("Sync, remembered corrections, long-title actions, exact seek and responsive layout passed");
} finally {
  await browser.close();
}
