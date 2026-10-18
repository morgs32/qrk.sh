import type { StorybookConfig } from "@storybook/react-vite";

const config = {
  stories: [
    "../components/**/*.stories.@(ts|tsx)",
    "../app/**/*.stories.@(ts|tsx)",
    "../library/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: "vite.storybook.config.mts",
      },
    },
  },
} satisfies StorybookConfig;

export default config;
