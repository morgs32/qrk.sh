import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.tsx", "../app/**/*.stories.tsx"],
  framework: "@storybook/nextjs-vite",
};

export default config;
