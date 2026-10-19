import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  deploymentId: process.env.NODE_ENV === "development" ? "qrk-web" : undefined,
};

export default nextConfig;
