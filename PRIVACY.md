# Privacy Policy — SoundCloud Synced Lyrics

**Effective date:** October 26, 2026

SoundCloud Synced Lyrics provides lyrics for the track a user is actively
playing on SoundCloud. This policy describes the limited data handling required
for that user-facing feature.

## Data handled by the extension

The extension reads the current SoundCloud track title, artist, artwork URL and
playback position. It may also handle lyrics, timestamps, a Genius URL, an LRC
file and an audio file that the user explicitly selects.

Optional Genius and Musixmatch credentials can be entered by the user. These
credentials, manual matches, imported lyrics and custom timestamps are stored
in the browser extension's local storage.

## How data is used and shared

- The current track title and artist are sent over HTTPS as search queries to
  Genius, LRCLIB and, only when the user configures it, Musixmatch.
- Optional Genius and Musixmatch credentials are sent only to their respective
  services when needed for a user-requested lookup.
- The extension may download speech-recognition model files from Hugging Face
  when the user starts local automatic synchronization.
- A user-selected audio file is processed locally in the browser. It is not
  uploaded by the extension.
- Playback position, imported LRC data, manual matches and timestamps remain
  local to the browser profile.

The relevant third-party services process requests under their own privacy
policies. The extension does not sell user data, use it for advertising, or
share it for credit, lending or unrelated analytics.

## Retention and deletion

Locally stored settings and corrections remain until the user clears extension
data or removes the extension. Remote lyrics services may retain request data
according to their own policies.

## Security

External requests use HTTPS. API credentials are not embedded in the extension
package or this public repository.

## Chrome Web Store Limited Use

Use of user data by SoundCloud Synced Lyrics complies with the Chrome Web Store
User Data Policy, including the Limited Use requirements. Data is used only to
provide and improve the extension's single purpose: displaying and
synchronizing lyrics for the SoundCloud track selected by the user.

## Contact

Questions and privacy requests can be submitted through the public GitHub issue
tracker:

https://github.com/insultikkk/soundcloud-synced-lyrics/issues
