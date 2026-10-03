import type { NextConfig } from "next";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const mapboxToken = process.env.PUBLIC_MAPBOX_TOKEN;

if (mapboxToken === undefined || mapboxToken.length === 0) {
  throw new Error(`PUBLIC_MAPBOX_TOKEN is required in ${packageRoot}/.env.local`);
}

// Preserve the backup worker's existing public URLs and bytes.
const backupAssets = new URL("./public/__zerospin/", import.meta.url);
mkdirSync(backupAssets, { recursive: true });
for (const [source, destination] of [
  ["backupWorker.bundle.js", "backup-worker.js"],
  ["wa-sqlite-async.wasm", "wa-sqlite-async.wasm"],
]) {
  copyFileSync(
    new URL(`../../vendor/zerospin/packages/backup-worker/dist/${source}`, import.meta.url),
    new URL(destination, backupAssets),
  );
}

const workerOrigin = process.env.LIBRARY_WORKER_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  env: { PUBLIC_MAPBOX_TOKEN: mapboxToken },
  sassOptions: { implementation: "sass-embedded" },
  webpack(config) {
    // Preserve the async loader's WASM fallback without aliasing the synchronous asset.
    config.resolve.alias["wa-sqlite-async.wasm$"] = fileURLToPath(
      new URL("../../vendor/zerospin/packages/browser/dist/sqlite.wasm", import.meta.url),
    );
    return config;
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/rpc", destination: `${workerOrigin}/rpc` },
        { source: "/upload", destination: `${workerOrigin}/upload` },
        { source: "/assets/:path*", destination: `${workerOrigin}/assets/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
