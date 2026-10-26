import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "node_modules", "@huggingface", "transformers", "dist");
const destination = resolve(root, "vendor");

await mkdir(destination, { recursive: true });
for (const filename of [
  "transformers.web.min.js",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
]) {
  await copyFile(resolve(source, filename), resolve(destination, filename));
}

console.log("Local Transformers.js runtime copied to vendor/");
