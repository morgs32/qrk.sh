import type { StorybookConfig } from "@storybook/react-vite";
import { loadEnv } from "vite-plus";

import { dirname } from "path";

import { fileURLToPath } from "url";

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: [
    "../components/**/*.stories.@(ts|tsx)",
    "../app/**/*.stories.@(ts|tsx)",
    "../modules/**/*.stories.@(ts|tsx)",
  ],
  addons: [getAbsolutePath("@storybook/addon-a11y"), getAbsolutePath("@storybook/addon-docs")],
  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
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
    const workerOrigin = (env.API_WORKER_ORIGIN ?? "http://127.0.0.1:8787").replace(/\/$/, "");
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
