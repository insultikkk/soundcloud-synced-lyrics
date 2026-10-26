# Mozilla source review instructions

## Environment

- Node.js 20 or newer
- npm 10 or newer
- Internet access for npm packages

## Reproduce the submitted extension

From the project root, run:

```powershell
npm ci
npm run build:auto-sync
npx --yes web-ext@latest build --overwrite-dest
```

The final ZIP is written to `web-ext-artifacts/`.

## Build details

The extension-specific JavaScript, HTML and CSS are not compiled or minified.
`npm run build:auto-sync` copies three pinned runtime files from
`@huggingface/transformers@3.8.1` into `vendor/`:

- `transformers.web.min.js`
- `ort-wasm-simd-threaded.jsep.mjs`
- `ort-wasm-simd-threaded.jsep.wasm`

The exact dependency version and integrity hashes are recorded in
`package-lock.json`. `web-ext-config.mjs` excludes tests, package metadata and
review-only documentation from the final extension package.

## Tests

```powershell
npm test
```
