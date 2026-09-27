import { fileURLToPath } from 'node:url';

import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';
import config from '@zerospin/fixtures/cli/zerospin.config';

export default makeWorkerdVitestConfig({
  packageRoot: fileURLToPath(new URL('.', import.meta.url)),
  include: ['config.workerd.spec.ts'],
  passWithNoTests: false,
  workerMainPath: fileURLToPath(
    new URL('../../../fixtures/src/cli/Worker.ts', import.meta.url),
  ),
  config,
});
