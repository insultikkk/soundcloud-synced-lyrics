export function alignLyricsToTranscript(lyricsLines, chunks, duration) {
  const lines = lyricsLines
    .map((text) => String(text ?? "").trim())
    .filter((text) => text && !/^\[.+]$/.test(text));
  const lyricWords = [];
  const lineWordIndexes = lines.map((line, lineIndex) =>
    tokenize(line).map((word) => {
      const index = lyricWords.length;
      lyricWords.push({ word, lineIndex });
      return index;
    }),
  );
  const transcriptWords = expandChunks(chunks);

  if (lines.length < 2) throw new Error("Нужно хотя бы две строки текста.");
  if (!transcriptWords.length) throw new Error("Whisper не распознал слова в аудио.");

  const mapping = sequenceAlignment(
    lyricWords.map((item) => item.word),
    transcriptWords.map((item) => item.word),
  );
  const starts = lines.map((_, lineIndex) => {
    const mappedWords = lineWordIndexes[lineIndex]
      .map((wordIndex) => mapping[wordIndex])
      .filter((wordIndex) => Number.isInteger(wordIndex));
    return mappedWords.length ? transcriptWords[mappedWords[0]].time : null;
  });
  const matchedWords = mapping.filter((index) => Number.isInteger(index)).length;
  const confidence = lyricWords.length ? matchedWords / lyricWords.length : 0;
  const filledStarts = interpolateMissingStarts(starts, lineWordIndexes, Number(duration));

  return {
    timedLyrics: lines.map((text, index) => ({ time: filledStarts[index], text })),
    confidence,
    matchedWords,
    totalWords: lyricWords.length,
  };
}

export function parseTimeInput(value) {
  const match = String(value ?? "").trim().match(/^(?:(\d+):)?(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!match) return Number.NaN;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2]);
  const fraction = Number((match[3] ?? "0").padEnd(3, "0").slice(0, 3)) / 1000;
  if (seconds >= 60) return Number.NaN;
  return minutes * 60 + seconds + fraction;
}

export function formatTimeInput(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function expandChunks(chunks) {
  const expanded = [];
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    const words = tokenize(chunk?.text ?? "");
    const start = Number(chunk?.timestamp?.[0]);
    const end = Number(chunk?.timestamp?.[1]);
    if (!words.length || !Number.isFinite(start)) continue;
    const safeEnd = Number.isFinite(end) && end >= start ? end : start;
    words.forEach((word, index) => {
      expanded.push({
        word,
        time: start + ((safeEnd - start) * index) / Math.max(1, words.length),
      });
    });
  }
  return expanded;
}

function sequenceAlignment(lyrics, transcript) {
  const columns = transcript.length + 1;
  const rows = lyrics.length + 1;
  const scores = new Float32Array(rows * columns);
  const moves = new Uint8Array(rows * columns);

  for (let row = 1; row < rows; row += 1) {
    scores[row * columns] = row * 0.9;
    moves[row * columns] = 1;
  }
  for (let column = 1; column < columns; column += 1) {
    scores[column] = column * 0.9;
    moves[column] = 2;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const similarity = wordSimilarity(lyrics[row - 1], transcript[column - 1]);
      const diagonal = scores[(row - 1) * columns + column - 1] + (1 - similarity);
      const up = scores[(row - 1) * columns + column] + 0.9;
      const left = scores[row * columns + column - 1] + 0.9;
      const index = row * columns + column;
      if (diagonal <= up && diagonal <= left) {
        scores[index] = diagonal;
        moves[index] = 3;
      } else if (up <= left) {
        scores[index] = up;
        moves[index] = 1;
      } else {
        scores[index] = left;
        moves[index] = 2;
      }
    }
  }

  const mapping = Array(lyrics.length).fill(null);
  let row = lyrics.length;
  let column = transcript.length;
  while (row > 0 || column > 0) {
    const move = moves[row * columns + column];
    if (move === 3) {
      if (wordSimilarity(lyrics[row - 1], transcript[column - 1]) >= 0.52) {
        mapping[row - 1] = column - 1;
      }
      row -= 1;
      column -= 1;
    } else if (move === 1 || column === 0) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  return mapping;
}

function interpolateMissingStarts(starts, lineWordIndexes, duration) {
  const result = [...starts];
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 180;
  const known = result
    .map((time, index) => (Number.isFinite(time) ? index : -1))
    .filter((index) => index >= 0);

  if (!known.length) {
    distribute(result, lineWordIndexes, 0, result.length - 1, 0, safeDuration * 0.94);
  } else {
    const first = known[0];
    if (first > 0) distribute(result, lineWordIndexes, 0, first, 0, result[first]);
    for (let index = 0; index < known.length - 1; index += 1) {
      const left = known[index];
      const right = known[index + 1];
      if (right - left > 1) {
        distribute(result, lineWordIndexes, left, right, result[left], result[right]);
      }
    }
    const last = known.at(-1);
    if (last < result.length - 1) {
      distribute(result, lineWordIndexes, last, result.length - 1, result[last], safeDuration * 0.98);
    }
  }

  for (let index = 0; index < result.length; index += 1) {
    const minimum = index ? result[index - 1] + 0.08 : 0;
    result[index] = Math.min(safeDuration, Math.max(minimum, Number(result[index]) || 0));
  }
  return result;
}

function distribute(result, lineWordIndexes, from, to, startTime, endTime) {
  if (to <= from) return;
  const weights = [];
  let total = 0;
  for (let index = from; index < to; index += 1) {
    const weight = Math.max(1, lineWordIndexes[index]?.length ?? 1);
    weights.push(weight);
    total += weight;
  }
  let elapsed = 0;
  for (let index = from; index <= to; index += 1) {
    if (!Number.isFinite(result[index])) {
      result[index] = startTime + ((endTime - startTime) * elapsed) / Math.max(1, total);
    }
    elapsed += weights[index - from] ?? 0;
  }
}

function wordSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return Math.max(0, 1 - distance / Math.max(left.length, right.length));
}

function levenshtein(left, right) {
  const previous = new Uint16Array(right.length + 1);
  const current = new Uint16Array(right.length + 1);
  for (let index = 0; index <= right.length; index += 1) previous[index] = index;
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.set(current);
  }
  return previous[right.length];
}

function tokenize(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
