import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  staticDirs: ['./public'],
  framework: {
    name: '@storybook/react-vite',
    options: {
      builder: {
        viteConfigPath: fileURLToPath(
          new URL('../vite.config.ts', import.meta.url),
        ),
      },
    },
  },
  viteFinal(config) {
    return mergeConfig(config, {
      server: {
        watch: {
          ignored: ['**/storybook-static/**'],
        },
      },
    });
  },
};

export default config;
