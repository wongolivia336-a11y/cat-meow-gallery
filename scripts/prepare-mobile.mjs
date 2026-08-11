import { cp, mkdir, rm, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "www");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of ["index.html", "styles.css", "app.js", "bubbles.js", "domi.js", "cloud.js", "manifest.webmanifest"]) {
  await copyFile(resolve(root, name), resolve(out, name));
}

await cp(resolve(root, "assets"), resolve(out, "assets"), { recursive: true });
await cp(resolve(root, "vendor"), resolve(out, "vendor"), { recursive: true });

console.log(`Prepared mobile web bundle in ${out}`);
