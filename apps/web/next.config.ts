import type { NextConfig } from "next";

const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/__zerospin/node-worker.js",
          destination: `${appOrigin}/__zerospin/node-worker.js`,
        },
        {
          source: "/__zerospin/node-sqlite.wasm",
          destination: `${appOrigin}/__zerospin/node-sqlite.wasm`,
        },
        {
          source: "/__zerospin/:path*",
          destination: `${appOrigin}/assets/__zerospin/:path*`,
          //
        },
        {
          source: "/assets/:path*",
          destination: `${appOrigin}/assets/:path*`,
        },
      ],
      afterFiles: [],
      // Keep web's pages and public files; app owns the remaining routes.
      fallback: [
        {
          source: "/:path*",
          destination: `${appOrigin}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
