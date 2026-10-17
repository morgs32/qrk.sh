import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const mapboxToken = process.env.PUBLIC_MAPBOX_TOKEN;

if (mapboxToken === undefined || mapboxToken.length === 0) {
  throw new Error(`PUBLIC_MAPBOX_TOKEN is required in ${packageRoot}/.env.local`);
}

const workerOrigin = process.env.LIBRARY_WORKER_ORIGIN ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  env: { PUBLIC_MAPBOX_TOKEN: mapboxToken },
  sassOptions: { implementation: "sass-embedded" },
  webpack: (config) => {
    config.module.parser ??= {};
    config.module.parser.javascript ??= {};
    config.module.parser.javascript.worker = [
      "*applicationWorker.create()",
      "...",
    ];
    config.resolve.alias["wa-sqlite-async.wasm"] = "@zerospin/browser/sqlite.wasm";
    return config;
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/rpc", destination: `${workerOrigin}/rpc` },
        { source: "/upload", destination: `${workerOrigin}/upload` },
        { source: "/image/upload", destination: `${workerOrigin}/image/upload` },
        { source: "/assets/:path*", destination: `${workerOrigin}/assets/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
