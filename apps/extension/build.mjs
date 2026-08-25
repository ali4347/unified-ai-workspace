import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

/** Development build (PRD §60 M10: extension ships as a dev build first).
 * Output: apps/extension/dist — load via chrome://extensions "Load unpacked". */

const entries = {
  background: "src/background/service-worker.ts",
  detect: "src/content/detect.ts",
  "portal-bridge": "src/content/portal-bridge.ts",
  popup: "src/popup/popup.ts",
};

await mkdir("dist", { recursive: true });

await Promise.all(
  Object.entries(entries).map(([name, entry]) =>
    build({
      entryPoints: [entry],
      outfile: `dist/${name}.js`,
      bundle: true,
      format: "iife",
      target: "chrome120",
      minify: false,
    })
  )
);

await copyFile("manifest.json", "dist/manifest.json");
await copyFile("src/popup/popup.html", "dist/popup.html");

console.log("Extension built to apps/extension/dist");
