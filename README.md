<p align="center">
  <img src="assets/icon-256.png" width="152" alt="SoundCloud Synced Lyrics logo">
</p>

<h1 align="center">SoundCloud Synced Lyrics</h1>

<p align="center">
  Smart lyrics matching, synchronized lines and local auto-sync directly inside SoundCloud.
</p>

<p align="center">
  <img alt="Version 0.8.3" src="https://img.shields.io/badge/version-0.8.3-ff5500?style=flat-square">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-111111?style=flat-square">
  <img alt="Chrome Firefox Zen" src="https://img.shields.io/badge/Chrome%20%7C%20Firefox%20%7C%20Zen-supported-ffffff?style=flat-square&labelColor=111111">
  <img alt="CI" src="https://github.com/insultikkk/soundcloud-synced-lyrics/actions/workflows/ci.yml/badge.svg">
</p>

## What it does

The extension adds a native-looking black, orange and white lyrics panel to
`soundcloud.com`. It detects the currently playing track, finds the best match,
and shows either synchronized lyrics or a clean unsynchronized view.

### Highlights

- smart matching for noisy SoundCloud titles, including `feat.`, `prod.`,
  remixes, slowed versions and uploader-added text;
- Genius, LRCLIB and optional Musixmatch lookup;
- synchronized line highlighting and automatic scrolling;
- click any timed line to seek the SoundCloud player;
- compact side panel and immersive full-screen mode;
- manual Genius link when automatic matching is wrong;
- LRC import and a built-in timestamp editor;
- local Whisper-powered alignment from a user-selected audio file;
- per-track corrections saved locally in the browser;
- Chrome, Firefox and Zen Browser support from one codebase.

## Installation

### Chrome

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this folder.
5. Refresh SoundCloud and start a track.

### Firefox / Zen Browser

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `manifest.json` from this folder.
4. Refresh SoundCloud and start a track.

The Mozilla-signed build is published separately through Firefox Add-ons.

## Using lyrics

Press the **Lyrics** button above the SoundCloud player. When a synchronized
source exists, the current line follows playback automatically. If the wrong
song is selected, use **Wrong lyrics?** and provide the correct Genius URL.

When timestamps are missing, open **+ Timestamps** to import an LRC file, tap
line times manually, or run the optional local auto-sync tool.

## Local auto-sync

Auto-sync uses Transformers.js and ONNX Runtime in the browser. The first run
downloads the required model files; the selected audio stays on the device.

To rebuild the bundled runtime after dependency changes:

```powershell
npm install
npm run build:auto-sync
```

## Development

Requirements: Node.js 20 or newer.

```powershell
npm install
npm test
```

Build the Firefox/Zen submission package:

```powershell
npx --yes web-ext@latest build --overwrite-dest
```

## Data and privacy

- Track title and artist are sent only as search queries to the selected lyrics
  providers.
- Optional Genius and Musixmatch credentials are stored in browser extension
  storage and are never included in this repository.
- Manual matches, imported lyrics and timestamps stay in the local browser
  profile.
- Audio selected for auto-sync is processed locally and is not uploaded by the
  extension.
- The extension contains no analytics or advertising.

## Important notes

Genius does not provide line timestamps. Timed lyrics come from Musixmatch,
LRCLIB, an imported LRC file or the local alignment tool. Site markup can change,
so selectors may require maintenance over time.

This project is not affiliated with SoundCloud, Genius, Musixmatch or LRCLIB.
Lyrics and artwork remain the property of their respective owners.

## License

Copyright (c) 2026 Odeal. All rights reserved. No open-source license is granted.
