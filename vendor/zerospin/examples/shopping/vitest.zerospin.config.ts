import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';

import config from './zerospin.config';

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/**/*.spec.ts'],
  passWithNoTests: false,
  config,
  workerBindings: { ZEROSPIN_SECRET_KEY: 'sk_test_system_runtime_capability' },
});
