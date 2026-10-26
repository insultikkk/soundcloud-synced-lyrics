import assert from "node:assert/strict";
import { alignLyricsToTranscript, formatTimeInput, parseTimeInput } from "./alignment-utils.mjs";

const result = alignLyricsToTranscript(
  ["[Verse]", "Sunday wake up", "Give me a cigarette", "Время шесть утра"],
  [
    { text: "Sunday", timestamp: [5, 5.4] },
    { text: "wake up", timestamp: [5.4, 6.1] },
    { text: "give me a cigarette", timestamp: [12, 14] },
    { text: "время шесть утра", timestamp: [21, 23] },
  ],
  30,
);

assert.deepEqual(result.timedLyrics.map((line) => line.text), [
  "Sunday wake up",
  "Give me a cigarette",
  "Время шесть утра",
]);
assert.deepEqual(result.timedLyrics.map((line) => line.time), [5, 12, 21]);
assert.equal(result.confidence, 1);
assert.equal(parseTimeInput("01:02.50"), 62.5);
assert.equal(formatTimeInput(62.5), "01:02.50");
assert.ok(Number.isNaN(parseTimeInput("1:99")));

const interpolated = alignLyricsToTranscript(
  ["First missing line", "Matched middle", "Last missing line"],
  [{ text: "matched middle", timestamp: [20, 21] }],
  60,
);
assert.ok(interpolated.timedLyrics[0].time < 20);
assert.equal(interpolated.timedLyrics[1].time, 20);
assert.ok(interpolated.timedLyrics[2].time > 20);

console.log("Automatic transcript-to-lyrics alignment passed");
