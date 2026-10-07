import type { NextConfig } from "next";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// Preserve the backup worker's existing public URLs and bytes.
const backupAssets = new URL("./public/__zerospin/", import.meta.url);
mkdirSync(backupAssets, { recursive: true });
for (const [source, destination] of [
  ["@zerospin/backup-worker/backup-worker.js", "backup-worker.js"],
  ["@zerospin/backup-worker/wa-sqlite-async.wasm", "wa-sqlite-async.wasm"],
]) {
  copyFileSync(require.resolve(source), new URL(destination, backupAssets));
}

const nextConfig: NextConfig = {
  assetPrefix: "/studio-static",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  env: {
    PUBLIC_MAPBOX_TOKEN: process.env.PUBLIC_MAPBOX_TOKEN ?? "",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787",
  },
  webpack(config) {
    // The prebundled SQLite loader contains a fallback URL as well as our explicit URL.
    // Both must resolve to the exact WASM bytes paired with this worker runtime.
    config.resolve.alias["wa-sqlite-async.wasm$"] =
      require.resolve("@zerospin/browser/sqlite.wasm");
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/assets/site-settings-social-preview.png",
        destination: "/site-settings-social-preview.png",
      },
      { source: "/assets/favicon.ico", destination: "/favicon.ico" },
      { source: "/assets/favicon-light.png", destination: "/favicon-light.png" },
      { source: "/assets/qrk-sh.svg", destination: "/qrk-sh.svg" },
    ];
  },
};

export default nextConfig;
