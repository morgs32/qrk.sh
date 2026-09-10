import path from 'node:path';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export function makePlaywrightVitestConfig(props: {
  packageRoot: string;
  include?: readonly string[];
}) {
  const {
    include = ['src/mainThreadFrontendFlow.playwright.spec.ts'],
    packageRoot,
  } = props;
  const repoRoot = path.resolve(packageRoot, '../..');

  return defineConfig({
    root: packageRoot,
    server: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    resolve: {
      alias: [
        {
          find: /^@\/(.+)$/,
          replacement: `${path.join(packageRoot, 'src')}/$1`,
        },
        {
          find: /^@zerospin\/core\/(.+)$/,
          replacement: `${path.join(repoRoot, 'packages/core/src')}/$1`,
        },
        {
          find: /^@zerospin\/dev-worker\/(.+)$/,
          replacement: `${path.join(repoRoot, 'packages/dev-worker/src')}/$1`,
        },
        {
          find: /^@zerospin\/react\/(.+)$/,
          replacement: `${path.join(repoRoot, 'packages/react/src')}/$1`,
        },
        {
          find: '@zerospin/error',
          replacement: path.join(repoRoot, 'packages/error/src/index.ts'),
        },
      ],
    },
    test: {
      include: [...include],
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
      testTimeout: 120_000,
    },
  });
}
