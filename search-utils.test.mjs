import assert from "node:assert/strict";
import {
  buildDirectGeniusUrls,
  buildQueries,
  chooseBestMatch,
  cleanTitle,
  coreTitle,
} from "./search-utils.mjs";

const cowboyclickerTrack = {
  artist: "cowboyclicker",
  title: "shelbydoesminecraft p. yamaka",
};

assert.equal(coreTitle(cowboyclickerTrack.title), "shelbydoesminecraft");
assert.deepEqual(buildQueries(cowboyclickerTrack), [
  "cowboyclicker shelbydoesminecraft",
  "cowboyclicker shelbydoesminecraft p. yamaka",
  "shelbydoesminecraft",
  "shelbydoesminecraft p. yamaka",
]);
assert.deepEqual(buildDirectGeniusUrls({ artist: "cowboyclicker", title: "birds" }), [
  "https://genius.com/cowboyclicker-birds-lyrics",
]);
assert.deepEqual(
  buildDirectGeniusUrls({ artist: "cowboyclicker", title: "sour (prod. nepuhz)" }),
  ["https://genius.com/cowboyclicker-sour-lyrics"],
);

const cowboyclickerMatch = {
  id: 1,
  title: "shelbydoesminecraft",
  url: "https://genius.com/Cowboyclicker-shelbydoesminecraft-lyrics",
  primary_artist: { name: "Cowboyclicker" },
};
const unrelated = {
  id: 2,
  title: "Shelby",
  url: "https://genius.com/Someone-shelby-lyrics",
  primary_artist: { name: "Someone Else" },
};

assert.equal(chooseBestMatch(cowboyclickerTrack, [unrelated, cowboyclickerMatch]), cowboyclickerMatch);

const generalCases = [
  ["Song Name feat. Guest", "Song Name"],
  ["Song Name ft Guest", "Song Name"],
  ["Song Name (prod. Producer)", "Song Name"],
  ["Song Name [produced by Producer]", "Song Name"],
  ["Song Name prod by Producer", "Song Name"],
  ["Song Name p. Producer", "Song Name"],
  ["Song Name (slowed + reverb)", "Song Name"],
  ["Song Name — official audio", "Song Name"],
  ["07. Song Name [Official Video]", "Song Name"],
  ["Song Name.mp3", "Song Name"],
];

for (const [soundCloudTitle, expectedTitle] of generalCases) {
  assert.equal(coreTitle(soundCloudTitle), expectedTitle, soundCloudTitle);
}

assert.equal(coreTitle("With or Without You"), "With or Without You");
assert.equal(cleanTitle("Actual Song (Remix)"), "Actual Song (Remix)");

const decoratedTrack = {
  artist: "Uploader Channel",
  title: "Real Artist - Song Name (Official Audio)",
};
assert.equal(buildQueries(decoratedTrack)[0], "Real Artist Song Name");
assert.equal(
  chooseBestMatch(decoratedTrack, [
    { id: 3, title: "Song Name", primary_artist: { name: "Real Artist" } },
    { id: 4, title: "Song Name", primary_artist: { name: "Uploader Channel" } },
  ])?.id,
  3,
);

assert.equal(
  chooseBestMatch(
    { artist: "Artist", title: "Song Name (feat. Guest) [Official Audio]" },
    [{ id: 5, title: "Song Name", primary_artist: { name: "Artist" } }],
  )?.id,
  5,
);

assert.equal(
  chooseBestMatch(
    { artist: "Uploader Channel", title: "under armour [prod. someone]" },
    [{ id: 6, title: "under armour", primary_artist: { name: "ONDA ANDAR" } }],
  ),
  null,
);
assert.equal(
  chooseBestMatch(
    { artist: "ONDA ANDAR", title: "under armour [prod. someone]" },
    [{ id: 6, title: "under armour", primary_artist: { name: "ONDA ANDAR" } }],
  )?.id,
  6,
);
assert.equal(
  chooseBestMatch(
    { artist: "Uploader Channel", title: "unhappy" },
    [{ id: 7, title: "unhappy", primary_artist: { name: "Wrong Artist" } }],
  ),
  null,
);
assert.equal(
  chooseBestMatch(
    { artist: "cowboyclicker", title: "RUSSIAN ROULETTE (PROD. NEPUHZ)" },
    [{ id: 8, title: "Russian Roulette", primary_artist: { name: "Rihanna" } }],
  ),
  null,
);

console.log("General SoundCloud-to-Genius title normalization and matching passed");
