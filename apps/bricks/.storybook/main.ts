import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import { loadEnv } from "vite-plus";

function getAbsolutePath(packageName: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${packageName}/package.json`)));
}

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [getAbsolutePath("@storybook/addon-a11y"), getAbsolutePath("@storybook/addon-docs")],
  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
    options: {
      builder: {
        viteConfigPath: fileURLToPath(new URL("../vite.storybook.config.ts", import.meta.url)),
      },
    },
  },
  async viteFinal(config, options) {
    const env = loadEnv(
      options.configType === "PRODUCTION" ? "production" : "development",
      fileURLToPath(new URL("..", import.meta.url)),
      "",
    );
    const workerOrigin = (env.API_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");
    return {
      ...config,
      server: {
        ...config.server,
        allowedHosts: ["bricks.qrk.localhost"],
        proxy: {
          ...config.server?.proxy,
          "/rpc": { target: workerOrigin, changeOrigin: true, ws: true },
          "/upload": { target: workerOrigin, changeOrigin: true },
          "/image/upload": { target: workerOrigin, changeOrigin: true },
          "/assets": { target: workerOrigin, changeOrigin: true },
        },
      },
    };
  },
};

export default config;
