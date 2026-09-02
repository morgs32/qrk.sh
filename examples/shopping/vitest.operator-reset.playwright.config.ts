/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePlaywrightVitestConfig } from '@zerospin/dev-worker/vitest/makePlaywrightVitestConfig';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default makePlaywrightVitestConfig({
  include: ['tests/browser/operatorReset.playwright.spec.ts'],
  packageRoot: __dirname,
});
