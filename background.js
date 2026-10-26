import { chooseSyncedRecord, parseSyncedLyrics } from "./lrc-utils.mjs";
import { buildDirectGeniusUrls, buildQueries, chooseBestMatch, coreTitle } from "./search-utils.mjs";

const DEFAULT_SETTINGS = {
  geniusToken: "",
  musixmatchKey: "",
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "auto-sync:open") {
    chrome.tabs.create({ url: chrome.runtime.getURL("auto-sync.html") })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type !== "lyrics:find" && message?.type !== "lyrics:from-url") {
    return false;
  }

  const request = message.type === "lyrics:from-url"
    ? findLyricsFromUrl(message.track, message.url)
    : findLyrics(message.track);
  request
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Не удалось загрузить текст.",
        searchUrl: buildSearchUrl(message.track),
      });
    });

  return true;
});

async function findLyricsFromUrl(track, value) {
  const sourceUrl = validateGeniusLyricsUrl(value);
  const pageResponse = await fetch(sourceUrl, {
    credentials: "include",
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });

  if (!pageResponse.ok) {
    return {
      ok: false,
      error: `Genius не отдал страницу текста (${pageResponse.status}).`,
      sourceUrl,
    };
  }

  return {
    ok: true,
    html: await pageResponse.text(),
    lyricsProvider: "Genius",
    sourceUrl,
    match: null,
  };
}

function validateGeniusLyricsUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("Вставьте полную ссылку на страницу песни Genius.");
  }

  const hostname = url.hostname.toLocaleLowerCase();
  if (
    url.protocol !== "https:" ||
    (hostname !== "genius.com" && hostname !== "www.genius.com") ||
    !/-lyrics\/?$/i.test(url.pathname)
  ) {
    throw new Error("Нужна ссылка Genius вида https://genius.com/artist-song-lyrics");
  }
  url.hash = "";
  return url.href;
}

async function findLyrics(track) {
  if (!track?.title) {
    return { ok: false, error: "SoundCloud пока не сообщил название трека." };
  }

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const queries = buildQueries(track);
  const [candidates, directPage, initialMusixmatchResult] = await Promise.all([
    searchCandidates(queries, settings.geniusToken).catch(() => []),
    findDirectGeniusPage(track).catch(() => null),
    findMusixmatchLyrics(track, null, settings.musixmatchKey).catch(() => null),
  ]);

  const best = chooseBestMatch(track, candidates);
  const match = best ? serializeMatch(best) : null;
  const musixmatchResult = initialMusixmatchResult || (match
    ? await findMusixmatchLyrics(track, match, settings.musixmatchKey).catch(() => null)
    : null);
  if (musixmatchResult?.timedLyrics?.length) {
    return {
      ok: true,
      timedLyrics: musixmatchResult.timedLyrics,
      lyricsProvider: "Musixmatch",
      syncSourceUrl: musixmatchResult.sourceUrl,
      sourceUrl: best?.url ?? "",
      searchUrl: buildSearchUrl(track),
      match,
    };
  }

  const lrcResult = await findLrcLyrics(track, match).catch(() => null);
  if (lrcResult?.timedLyrics?.length) {
    return {
      ok: true,
      timedLyrics: lrcResult.timedLyrics,
      lyricsProvider: "LRCLIB",
      syncSourceUrl: `https://lrclib.net/api/get/${lrcResult.record.id}`,
      sourceUrl: best?.url ?? "",
      searchUrl: buildSearchUrl(track),
      match,
    };
  }

  if (directPage) {
    return {
      ok: true,
      html: directPage.html,
      lyricsProvider: "Genius",
      sourceUrl: directPage.sourceUrl,
      searchUrl: buildSearchUrl(track),
      match: match ?? directPage.match,
    };
  }

  if (!best?.url) {
    if (lrcResult?.plainLyrics) {
      return {
        ok: true,
        plainLyrics: lrcResult.plainLyrics,
        lyricsProvider: "LRCLIB",
        syncSourceUrl: `https://lrclib.net/api/get/${lrcResult.record.id}`,
        searchUrl: buildSearchUrl(track),
        match,
      };
    }
    return {
      ok: false,
      error: "Текст не найден в доступных источниках.",
      searchUrl: buildSearchUrl(track),
    };
  }

  const response = await fetch(best.url, {
    credentials: "include",
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });

  if (!response.ok) {
    if (lrcResult?.plainLyrics) {
      return {
        ok: true,
        plainLyrics: lrcResult.plainLyrics,
        lyricsProvider: "LRCLIB",
        syncSourceUrl: `https://lrclib.net/api/get/${lrcResult.record.id}`,
        sourceUrl: best.url,
        searchUrl: buildSearchUrl(track),
        match,
      };
    }
    return {
      ok: false,
      error: `Genius не отдал страницу текста (${response.status}).`,
      sourceUrl: best.url,
      searchUrl: buildSearchUrl(track),
      match,
    };
  }

  return {
    ok: true,
    html: await response.text(),
    lyricsProvider: "Genius",
    sourceUrl: best.url,
    searchUrl: buildSearchUrl(track),
    match,
  };
}

async function findDirectGeniusPage(track) {
  for (const sourceUrl of buildDirectGeniusUrls(track)) {
    const response = await fetch(sourceUrl, {
      credentials: "include",
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok) continue;

    const html = await response.text();
    if (!/data-lyrics-container=|Lyrics__Container-/i.test(html)) continue;
    return {
      html,
      sourceUrl: response.url || sourceUrl,
      match: {
        title: coreTitle(track.title),
        artist: track.artist ?? "",
        artwork: "",
      },
    };
  }
  return null;
}

async function findMusixmatchLyrics(track, match, apiKey) {
  const key = String(apiKey ?? "").trim();
  if (!key) return null;

  const canonicalTrack = {
    title: match?.title || coreTitle(track.title),
    artist: match?.artist || track.artist,
  };
  if (!canonicalTrack.title || !canonicalTrack.artist) return null;

  const url = new URL("https://api.musixmatch.com/ws/1.1/matcher.subtitle.get");
  url.searchParams.set("q_track", canonicalTrack.title);
  url.searchParams.set("q_artist", canonicalTrack.artist);
  url.searchParams.set("subtitle_format", "lrc");
  url.searchParams.set("apikey", key);

  const duration = Number(track.duration);
  if (Number.isFinite(duration) && duration >= 1 && duration <= 3600) {
    url.searchParams.set("f_subtitle_length", String(Math.round(duration)));
    url.searchParams.set("f_subtitle_length_max_deviation", "12");
  }

  const response = await fetch(url, {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const payload = await response.json();
  if (payload?.message?.header?.status_code !== 200) return null;
  const subtitle = payload?.message?.body?.subtitle;
  const timedLyrics = parseSyncedLyrics(subtitle?.subtitle_body ?? "");
  if (!timedLyrics.length) return null;

  return {
    timedLyrics,
    sourceUrl: buildMusixmatchSearchUrl(canonicalTrack),
  };
}

function buildMusixmatchSearchUrl(track) {
  const query = [track.artist, track.title].filter(Boolean).join(" ");
  return `https://www.musixmatch.com/search/${encodeURIComponent(query)}`;
}

async function findLrcLyrics(track, geniusMatch) {
  const canonicalTrack = {
    title: geniusMatch?.title || coreTitle(track.title),
    artist: geniusMatch?.artist || track.artist,
  };
  const duration = Number(track.duration);
  const exactUrl = new URL("https://lrclib.net/api/get");
  exactUrl.searchParams.set("track_name", canonicalTrack.title);
  exactUrl.searchParams.set("artist_name", canonicalTrack.artist);
  if (Number.isFinite(duration) && duration >= 1 && duration <= 3600) {
    exactUrl.searchParams.set("duration", String(Math.round(duration)));
  }

  const exactResponse = await fetchLrc(exactUrl);
  let plainFallback = null;
  if (exactResponse.ok) {
    const record = await exactResponse.json();
    const timedLyrics = parseSyncedLyrics(record.syncedLyrics ?? "");
    const recordDuration = Number(record.duration);
    const durationMatches =
      !Number.isFinite(duration) ||
      !Number.isFinite(recordDuration) ||
      Math.abs(recordDuration - duration) <= 8;
    if (timedLyrics.length && durationMatches) {
      return { record, timedLyrics, plainLyrics: record.plainLyrics };
    }
    if (record.plainLyrics && durationMatches) {
      plainFallback = { record, plainLyrics: record.plainLyrics };
    }
  } else if (exactResponse.status === 429) {
    return null;
  }

  await delay(250);
  const searchUrl = new URL("https://lrclib.net/api/search");
  searchUrl.searchParams.set("track_name", canonicalTrack.title);
  searchUrl.searchParams.set("artist_name", canonicalTrack.artist);
  const searchResponse = await fetchLrc(searchUrl);
  if (!searchResponse.ok) return plainFallback;

  const records = await searchResponse.json();
  const syncedRecord = chooseSyncedRecord(canonicalTrack, records, duration);
  if (syncedRecord) {
    return {
      record: syncedRecord,
      timedLyrics: parseSyncedLyrics(syncedRecord.syncedLyrics),
      plainLyrics: syncedRecord.plainLyrics,
    };
  }

  const plainRecords = records.filter((record) => typeof record.plainLyrics === "string");
  const plainMatch = chooseBestMatch(
    canonicalTrack,
    plainRecords.map((record) => ({
      id: record.id,
      title: record.trackName ?? record.name ?? "",
      primary_artist: { name: record.artistName ?? "" },
      record,
    })),
  );
  return plainMatch?.record
    ? { record: plainMatch.record, plainLyrics: plainMatch.record.plainLyrics }
    : plainFallback;
}

function fetchLrc(url) {
  return fetch(url, {
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "Lrclib-Client": "LyricsForSoundCloud v0.8.1 (http://localhost)",
    },
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function searchOfficialApi(query, token) {
  const response = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Genius API ответил ${response.status}.`);
  }

  const payload = await response.json();
  return (payload?.response?.hits ?? []).map((hit) => hit.result).filter(Boolean);
}

async function searchCandidates(queries, token) {
  const search = token
    ? (query) => searchOfficialApi(query, token)
    : (query) => searchGeniusWebsite(query);

  let candidates;
  try {
    candidates = await runSearches(queries, search);
  } catch (error) {
    if (!token) throw error;
    candidates = await runSearches(queries, searchGeniusWebsite);
  }

  const uniqueCandidates = new Map();
  for (const candidate of candidates) {
    const key = candidate.id ?? candidate.url;
    if (key && !uniqueCandidates.has(key)) uniqueCandidates.set(key, candidate);
  }
  return [...uniqueCandidates.values()];
}

async function runSearches(queries, search) {
  const results = await Promise.allSettled(queries.map((query) => search(query)));
  const successful = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  if (successful.length) return successful;
  const failure = results.find((result) => result.status === "rejected");
  throw failure?.reason ?? new Error("Genius не ответил на поисковые запросы.");
}

async function searchGeniusWebsite(query) {
  const endpoint = `https://genius.com/api/search/multi?per_page=8&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Поиск Genius недоступен. Добавьте API-токен в настройках расширения.");
  }

  const payload = await response.json();
  const sections = payload?.response?.sections ?? [];
  return sections
    .filter((section) => section.type === "song" || section.type === "top_hit")
    .flatMap((section) => section.hits ?? [])
    .map((hit) => hit.result)
    .filter(Boolean);
}

function serializeMatch(candidate) {
  return {
    title: candidate.title ?? "",
    artist: candidate.primary_artist?.name ?? candidate.artist_names ?? "",
    artwork:
      candidate.song_art_image_url ??
      candidate.header_image_url ??
      candidate.song_art_image_thumbnail_url ??
      "",
  };
}

function buildQuery(track) {
  return buildQueries(track)[0] ?? "";
}

function buildSearchUrl(track) {
  return `https://genius.com/search?q=${encodeURIComponent(buildQuery(track))}`;
}

