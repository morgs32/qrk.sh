import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/tanstack-react';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  staticDirs: ['../public'],
  framework: '@storybook/tanstack-react',
  viteFinal: config => ({
    ...config,
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  }),
};

export default config;
