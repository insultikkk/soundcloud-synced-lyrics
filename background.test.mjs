import assert from "node:assert/strict";

let messageListener;
globalThis.chrome = {
  runtime: {
    getURL(path) {
      return `chrome-extension://test/${path}`;
    },
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      },
    },
  },
  storage: {
    local: {
      get: async (defaults) => ({ ...defaults, musixmatchKey: "test-key" }),
    },
  },
  tabs: {
    async create(options) {
      createdTabs.push(options);
    },
  },
};

const requestedUrls = [];
const createdTabs = [];
globalThis.fetch = async (input) => {
  const url = String(input);
  requestedUrls.push(url);

  if (url.startsWith("https://api.musixmatch.com/")) {
    if (new URL(url).searchParams.get("q_track") === "birds") {
      return new Response("", { status: 404 });
    }
    return Response.json({
      message: {
        header: { status_code: 200 },
        body: {
          subtitle: {
            subtitle_body: "[00:04.20]First line\n[00:09.00]Second line",
          },
        },
      },
    });
  }

  if (url.startsWith("https://genius.com/api/search/multi")) {
    return Response.json({
      response: {
        sections: [{
          type: "song",
          hits: [{
            result: {
              id: 1,
              title: "Test Song",
              url: "https://genius.com/test-artist-test-song-lyrics",
              primary_artist: { name: "Test Artist" },
            },
          }],
        }],
      },
    });
  }

  if (url === "https://genius.com/test-artist-correct-song-lyrics") {
    return new Response("<div data-lyrics-container='true'>Correct manual lyrics</div>", {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (url === "https://genius.com/cowboyclicker-birds-lyrics") {
    return new Response("<div data-lyrics-container='true'>Birds direct lyrics</div>", {
      headers: { "Content-Type": "text/html" },
    });
  }

  throw new Error(`Unexpected request: ${url}`);
};

await import("./background.js");
assert.equal(typeof messageListener, "function");

const autoSyncResponse = await new Promise((resolve) => {
  const staysOpen = messageListener({ type: "auto-sync:open" }, null, resolve);
  assert.equal(staysOpen, true);
});
assert.deepEqual(autoSyncResponse, { ok: true });
assert.deepEqual(createdTabs, [{ url: "chrome-extension://test/auto-sync.html" }]);

const response = await new Promise((resolve) => {
  const staysOpen = messageListener({
    type: "lyrics:find",
    track: { title: "Test Song", artist: "Test Artist", duration: 120 },
  }, null, resolve);
  assert.equal(staysOpen, true);
});

assert.equal(response.ok, true);
assert.equal(response.lyricsProvider, "Musixmatch");
assert.deepEqual(response.timedLyrics, [
  { time: 4.2, text: "First line" },
  { time: 9, text: "Second line" },
]);
assert.match(response.syncSourceUrl, /^https:\/\/www\.musixmatch\.com\/search\//);

const directResponse = await new Promise((resolve) => {
  messageListener({
    type: "lyrics:find",
    track: { title: "birds", artist: "cowboyclicker", duration: 120 },
  }, null, resolve);
});
assert.equal(directResponse.ok, true);
assert.equal(directResponse.lyricsProvider, "Genius");
assert.equal(directResponse.sourceUrl, "https://genius.com/cowboyclicker-birds-lyrics");
assert.match(directResponse.html, /Birds direct lyrics/);

const musixmatchRequest = requestedUrls.find((url) => url.startsWith("https://api.musixmatch.com/"));
assert.ok(musixmatchRequest);
const parsedRequest = new URL(musixmatchRequest);
assert.equal(parsedRequest.pathname, "/ws/1.1/matcher.subtitle.get");
assert.equal(parsedRequest.searchParams.get("subtitle_format"), "lrc");
assert.equal(parsedRequest.searchParams.get("f_subtitle_length"), "120");

const musixmatchRequestsBeforeManualChoice = requestedUrls
  .filter((url) => url.startsWith("https://api.musixmatch.com/"))
  .length;
const manualResponse = await new Promise((resolve) => {
  messageListener({
    type: "lyrics:from-url",
    track: { title: "Wrong automatic match", artist: "Uploader", duration: 120 },
    url: "https://genius.com/test-artist-correct-song-lyrics",
  }, null, resolve);
});
assert.equal(manualResponse.ok, true);
assert.equal(manualResponse.lyricsProvider, "Genius");
assert.match(manualResponse.html, /Correct manual lyrics/);
assert.equal(manualResponse.timedLyrics, undefined);
assert.equal(
  requestedUrls.filter((url) => url.startsWith("https://api.musixmatch.com/")).length,
  musixmatchRequestsBeforeManualChoice,
  "A manually selected Genius page must bypass automatic synced matches",
);

console.log("Musixmatch subtitles are preferred and parsed as timed lyrics");
