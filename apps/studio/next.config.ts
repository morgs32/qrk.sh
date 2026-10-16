import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  assetPrefix: "/studio-static",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  env: {
    PUBLIC_MAPBOX_TOKEN: process.env.PUBLIC_MAPBOX_TOKEN ?? "",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787",
  },
  turbopack: {
    resolveAlias: {
      // Match the async loader's fallback to the WASM paired with this worker runtime.
      "wa-sqlite-async.wasm": "@zerospin/browser/sqlite.wasm",
    },
  },
  async rewrites() {
    return [
      {
        source: "/rpc",
        destination: `${(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "")}/rpc`,
      },
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
