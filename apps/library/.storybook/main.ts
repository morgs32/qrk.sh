import type { StorybookConfig } from "@storybook/react-vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
};

export default config;
