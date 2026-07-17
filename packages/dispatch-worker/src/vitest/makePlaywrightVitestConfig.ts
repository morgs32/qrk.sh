import path from 'node:path';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export function makePlaywrightVitestConfig(props: {
  packageRoot: string;
  include?: readonly string[];
}) {
  const { include = ['src/reactAndSharedWorkerFlow1.playwright.spec.ts'] } =
    props;
  const repoRoot = path.resolve(props.packageRoot, '../..');

  return defineConfig({
    root: props.packageRoot,
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
          replacement: `${path.join(props.packageRoot, 'src')}/$1`,
        },
        {
          find: /^@zerospin\/core\/(.+)$/,
          replacement: `${path.join(repoRoot, 'packages/core/src')}/$1`,
        },
        {
          find: /^@zerospin\/dispatch-worker\/(.+)$/,
          replacement: `${path.join(repoRoot, 'packages/dispatch-worker/src')}/$1`,
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
