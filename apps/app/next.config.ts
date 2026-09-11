import type { NextConfig } from "next";
import { copyFileSync, mkdirSync } from "node:fs";

// Next serves the same backup-worker assets as Zerospin's Vite plugin.
const backupWorkerAssets = new URL("./public/__zerospin/", import.meta.url);
mkdirSync(backupWorkerAssets, { recursive: true });
copyFileSync(
  new URL(
    "../../vendor/zerospin/packages/backup-worker/dist/backupWorker.bundle.js",
    import.meta.url,
  ),
  new URL("backup-worker.js", backupWorkerAssets),
);
copyFileSync(
  new URL(
    "../../vendor/zerospin/packages/backup-worker/dist/wa-sqlite-async.wasm",
    import.meta.url,
  ),
  new URL("wa-sqlite-async.wasm", backupWorkerAssets),
);

const mapboxToken = process.env.PUBLIC_MAPBOX_TOKEN;

if (mapboxToken === undefined || mapboxToken.length === 0) {
  throw new Error("PUBLIC_MAPBOX_TOKEN is required in apps/app/.env.local");
}

const nextConfig: NextConfig = {
  assetPrefix: "/app-static",
  devIndicators: {
    position: "bottom-left",
  },
  env: {
    PUBLIC_MAPBOX_TOKEN: mapboxToken,
  },
  transpilePackages: ["@qrk.sh/zerospin"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.githubassets.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "hebbkx1anhila5yf.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    // Enable experimental features if needed
  },
  // Ensure proper handling of Vercel Analytics and Speed Insights
  // headers: async () => {
  //   return [
  //     {
  //       source: '/_vercel/speed-insights/script.js',
  //       headers: [
  //         {
  //           key: 'Cache-Control',
  //           value: 'public, max-age=31536000, immutable',
  //         },
  //       ],
  //     },
  //   ];
  // },
};

export default nextConfig;
