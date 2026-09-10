import type { NextConfig } from "next";

const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/app-static/:path*",
          destination: `${appOrigin}/app-static/:path*`,
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
