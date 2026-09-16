// Creative Harness addition: keep the canvas usable without a CDN connection.
import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("@tldraw/assets/package.json"));
const destination = fileURLToPath(
  new URL("../public/tldraw/", import.meta.url),
);
await mkdir(destination, { recursive: true });
for (const entry of [
  "fonts",
  "icons",
  "translations",
  "embed-icons",
  "LICENSE.md",
]) {
  await cp(join(source, entry), join(destination, entry), { recursive: true });
}
console.log("Prepared local tldraw assets.");
