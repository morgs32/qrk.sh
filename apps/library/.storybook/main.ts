import type { StorybookConfig } from "@storybook/react-vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite-plus";

const config: StorybookConfig = {
  stories: [
    "../components/**/*.stories.@(ts|tsx)",
    "../lib/**/*.stories.@(ts|tsx)",
    "../modules/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    dirname(fileURLToPath(import.meta.resolve("@storybook/addon-a11y/package.json"))),
    dirname(fileURLToPath(import.meta.resolve("@storybook/addon-docs/package.json"))),
  ],
  framework: {
    name: dirname(fileURLToPath(import.meta.resolve("@storybook/react-vite/package.json"))),
    options: {
      builder: {
        viteConfigPath: "vite.storybook.config.ts",
      },
    },
  },
  async viteFinal(config, options) {
    const env = loadEnv(
      options.configType === "PRODUCTION" ? "production" : "development",
      ".",
      "",
    );
    const workerOrigin = (env.LIBRARY_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");
    // Storybook replaces Vite's server block before this final configuration hook.
    return {
      ...config,
      server: {
        ...config.server,
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
