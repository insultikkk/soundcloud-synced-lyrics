import { chooseBestMatch, coreTitle } from "./search-utils.mjs";

export function parseSyncedLyrics(value = "") {
  const offsetMatch = value.match(/^\[offset:([+-]?\d+)]/im);
  const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const parsed = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g)];
    if (!timestamps.length) continue;
    const text = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g, "").trim();
    if (!text) continue;

    for (const timestamp of timestamps) {
      const minutes = Number(timestamp[1]);
      const seconds = Number(timestamp[2]);
      const fraction = Number((timestamp[3] ?? "0").padEnd(3, "0").slice(0, 3)) / 1000;
      parsed.push({
        time: Math.max(0, minutes * 60 + seconds + fraction + offsetSeconds),
        text,
      });
    }
  }

  parsed.sort((left, right) => left.time - right.time);
  return parsed.filter(
    (line, index) =>
      index === 0 || line.time !== parsed[index - 1].time || line.text !== parsed[index - 1].text,
  );
}

export function chooseSyncedRecord(track, records, duration) {
  const synced = records.filter(
    (record) => typeof record.syncedLyrics === "string" && parseSyncedLyrics(record.syncedLyrics).length,
  );
  if (!synced.length) return null;

  const targetDuration = Number(duration);
  const hasTargetDuration = Number.isFinite(targetDuration) && targetDuration > 0;
  const closeDuration = hasTargetDuration
    ? synced.filter(
        (record) =>
          Number.isFinite(Number(record.duration)) &&
          Math.abs(Number(record.duration) - targetDuration) <= 8,
      )
    : [];
  if (hasTargetDuration && !closeDuration.length) return null;
  const pool = hasTargetDuration ? closeDuration : synced;
  const mapped = pool.map((record) => ({
    id: record.id,
    title: record.trackName ?? record.name ?? "",
    primary_artist: { name: record.artistName ?? "" },
    record,
  }));
  const best = chooseBestMatch(
    { artist: track.artist ?? "", title: coreTitle(track.title ?? "") },
    mapped,
  );
  return best?.record ?? null;
}
