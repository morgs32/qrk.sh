import { fileURLToPath } from 'node:url';

import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';

import config from './zerospin.config';

export default makeWorkerdVitestConfig({
  packageRoot: fileURLToPath(new URL('.', import.meta.url)),
  include: ['config.workerd.spec.ts'],
  passWithNoTests: false,
  workerMainPath: fileURLToPath(new URL('./Worker.ts', import.meta.url)),
  config,
});
