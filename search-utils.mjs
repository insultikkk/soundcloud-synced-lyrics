const CREDIT_MARKER =
  /(?:feat(?:uring)?|ft|f\/|prod(?:uced)?(?:\s+by)?|p|beat\s+by|instrumental\s+by|mix(?:ed)?\s+by|master(?:ed)?\s+by)\.?/i;
const PLAYBACK_VARIANT =
  /(?:slowed(?:\s*(?:\+|&|and)\s*reverb)?|sped\s+up|nightcore|snippet|preview|visuali[sz]er|radio\s+edit|extended\s+(?:mix|version))/i;

export function chooseBestMatch(track, candidates) {
  if (!candidates.length) return null;

  const decorated = parseDecoratedTitle(track.title);
  const expectedTitles = titleVariants(decorated?.title ?? track.title)
    .map(tokenSet)
    .filter((tokens) => tokens.size);
  const expectedArtists = unique([decorated?.artist ?? "", cleanArtist(track.artist)])
    .map(tokenSet)
    .filter((tokens) => tokens.size);

  const ranked = candidates.map((candidate) => {
    const candidateTitles = unique([
      candidate.title ?? "",
      candidate.title_with_featured ?? "",
    ])
      .flatMap(titleVariants)
      .map(tokenSet)
      .filter((tokens) => tokens.size);
    const candidateArtist = tokenSet(
      candidate.primary_artist?.name ?? candidate.artist_names ?? candidate.full_title ?? "",
    );
    const titleScore = bestSimilarity(expectedTitles, candidateTitles);
    const artistScore = expectedArtists.length
      ? Math.max(...expectedArtists.map((artist) => tokenSimilarity(artist, candidateArtist)))
      : 0.5;
    let score = titleScore * 0.72 + artistScore * 0.28;
    if (
      candidateArtist.size &&
      expectedArtists.length &&
      artistScore < 0.34
    ) {
      score *= 0.72;
    }
    return { candidate, score };
  });

  ranked.sort((left, right) => right.score - left.score);
  return ranked[0].score >= 0.55 ? ranked[0].candidate : null;
}

export function buildQueries(track) {
  const uploader = cleanArtist(track.artist);
  const decorated = parseDecoratedTitle(track.title);
  const creditedArtist = decorated?.artist ?? "";
  const titles = titleVariants(decorated?.title ?? track.title);
  const shortTitle = titles.at(-1) ?? "";
  const fullTitle = titles[0] ?? "";

  return unique([
    [creditedArtist || uploader, shortTitle].filter(Boolean).join(" "),
    [uploader, shortTitle].filter(Boolean).join(" "),
    [creditedArtist || uploader, fullTitle].filter(Boolean).join(" "),
    shortTitle,
    fullTitle,
  ]).filter(Boolean);
}

export function buildDirectGeniusUrls(track) {
  const uploader = cleanArtist(track.artist);
  const decorated = parseDecoratedTitle(track.title);
  const artists = unique([decorated?.artist ?? "", uploader]);
  const titles = titleVariants(decorated?.title ?? track.title);

  return unique(
    artists.flatMap((artist) =>
      titles.map((title) => {
        const slug = geniusSlug(`${artist} ${title}`);
        return slug ? `https://genius.com/${slug}-lyrics` : "";
      }),
    ),
  );
}

export function cleanTitle(value = "") {
  return collapseWhitespace(value)
    .replace(/^\s*\d{1,3}\s*[.)_-]\s+/, "")
    .replace(/\[([^\]]{1,120})]/g, (group, contents) =>
      isMetadataGroup(contents) ? " " : group,
    )
    .replace(/\(([^)]{1,120})\)/g, (group, contents) =>
      isMetadataGroup(contents) ? " " : group,
    )
    .replace(
      /\b(?:official\s+(?:audio|video)|music\s+video|lyrics?\s+video|official\s+visuali[sz]er)\b/gi,
      " ",
    )
    .replace(/\.(?:mp3|wav|flac|m4a)$/i, "")
    .replace(/\s*[-–—|•:]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function coreTitle(value = "") {
  const creditSuffix = new RegExp(
    `(?:\\s+|\\s*[-–—|•:]\\s*)${CREDIT_MARKER.source}\\s*[:@-]?\\s+.+$`,
    "i",
  );
  const playbackSuffix = new RegExp(
    `(?:\\s+|\\s*[-–—|•:]\\s*)${PLAYBACK_VARIANT.source}\\s*$`,
    "i",
  );

  return cleanTitle(value)
    .replace(creditSuffix, "")
    .replace(playbackSuffix, "")
    .replace(/\s+[|—–]\s+.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleVariants(value = "") {
  const fullTitle = cleanTitle(value);
  const shortTitle = coreTitle(value);
  const withoutTrailingGroup = fullTitle
    .replace(/\s*[[(][^\])]{1,100}[\])]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return unique([fullTitle, withoutTrailingGroup, shortTitle]);
}

function parseDecoratedTitle(value = "") {
  const match = collapseWhitespace(value).match(/^(.{1,80}?)\s+(?:-|–|—|\|)\s+(.{1,180})$/);
  if (!match) return null;
  const artist = cleanArtist(match[1]);
  const title = cleanTitle(match[2]);
  return artist && title ? { artist, title } : null;
}

function isMetadataGroup(contents) {
  const normalized = collapseWhitespace(contents);
  return (
    CREDIT_MARKER.test(normalized) ||
    PLAYBACK_VARIANT.test(normalized) ||
    /^(?:official|audio|video|lyrics?|music\s+video|free\s+download|hq|hd|4k)\b/i.test(normalized)
  );
}

function cleanArtist(value = "") {
  return collapseWhitespace(value)
    .replace(/\s*[|—–]\s*(?:official|music|records?).*$/i, "")
    .trim();
}

function tokenSet(value = "") {
  return new Set(
    value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter(
        (token) =>
          token.length > 1 &&
          !["lyrics", "official", "audio", "video", "music", "hq", "hd"].includes(token),
      ),
  );
}

function geniusSlug(value = "") {
  return collapseWhitespace(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function bestSimilarity(leftSets, rightSets) {
  return Math.max(
    0,
    ...leftSets.flatMap((left) => rightSets.map((right) => tokenSimilarity(left, right))),
  );
}

function tokenSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const dice = (2 * intersection) / (left.size + right.size);
  let containment = intersection / Math.min(left.size, right.size);
  if (Math.min(left.size, right.size) === 1 && Math.max(left.size, right.size) > 2) {
    containment *= 0.82;
  }
  return Math.max(dice, containment * 0.95);
}

function collapseWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map((value) => collapseWhitespace(value)).filter(Boolean))];
}
