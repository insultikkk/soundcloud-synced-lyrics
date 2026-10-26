import assert from "node:assert/strict";
import { chooseSyncedRecord, parseSyncedLyrics } from "./lrc-utils.mjs";

assert.deepEqual(
  parseSyncedLyrics("[offset:+500]\n[00:01.20] First line\n[00:03.045][00:04.00] Second line"),
  [
    { time: 1.7, text: "First line" },
    { time: 3.545, text: "Second line" },
    { time: 4.5, text: "Second line" },
  ],
);

const correct = {
  id: 10,
  trackName: "under armour",
  artistName: "ONDA ANDAR",
  duration: 129,
  syncedLyrics: "[00:10.00] First\n[00:20.00] Second",
};
const wrongVersion = {
  id: 11,
  trackName: "under armour",
  artistName: "ONDA ANDAR",
  duration: 240,
  syncedLyrics: "[00:10.00] Wrong version",
};

assert.equal(
  chooseSyncedRecord(
    { artist: "ONDA ANDAR", title: "under armour [prod. dj]" },
    [wrongVersion, correct],
    129,
  ),
  correct,
);
assert.equal(chooseSyncedRecord({ artist: "Artist", title: "Song" }, [], 180), null);
assert.equal(
  chooseSyncedRecord(
    { artist: "Rihanna", title: "Russian Roulette" },
    [{
      id: 12,
      trackName: "Russian Roulette",
      artistName: "Rihanna",
      duration: 203,
      syncedLyrics: "[00:10.00] Wrong song",
    }],
    125,
  ),
  null,
);

console.log("LRC parsing, timestamps and duration-aware matching passed");
