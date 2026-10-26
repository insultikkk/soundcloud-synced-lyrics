import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist", "chrome");
const expectedPrefix = `${root}${sep}`;

if (!output.startsWith(expectedPrefix) || relative(root, output) !== join("dist", "chrome")) {
  throw new Error("Refusing to write outside dist/chrome");
}

const files = [
  "alignment-utils.mjs",
  "auto-sync-worker.js",
  "auto-sync.css",
  "auto-sync.html",
  "auto-sync.js",
  "background.js",
  "content.js",
  "lrc-utils.mjs",
  "options.html",
  "options.js",
  "popup.html",
  "popup.js",
  "search-utils.mjs",
  "settings.css",
  "styles.css",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(root, file), destination);
}

await cp(resolve(root, "assets"), resolve(output, "assets"), { recursive: true });
await cp(resolve(root, "vendor"), resolve(output, "vendor"), { recursive: true });

const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
delete manifest.browser_specific_settings;
manifest.background = {
  service_worker: manifest.background.service_worker,
  type: manifest.background.type,
};

await writeFile(
  resolve(output, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Chrome Web Store package prepared at ${output}`);
