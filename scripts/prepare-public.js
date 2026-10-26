import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

// Rebuild only the public asset staging directory. Never touches user data or source files.
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const name of ["images", "assets"]) {
  const source = path.join(root, name);
  if (fs.existsSync(source)) {
    fs.cpSync(source, path.join(publicDir, name), { recursive: true });
  }
}

// The PWA service worker is kept for GitHub Pages but is skipped inside Capacitor.
const swSource = path.join(root, "js", "service-worker.js");
const swTarget = path.join(publicDir, "js", "service-worker.js");
fs.mkdirSync(path.dirname(swTarget), { recursive: true });
fs.copyFileSync(swSource, swTarget);

console.log("Prepared static assets for Vite build.");
