import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';
import config from '@zerospin/fixtures/system-worker/systems/system';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/ProductionWorker.system-repo.workerd.spec.ts'],
  packageRoot,
  passWithNoTests: false,
  configModulePath: path.resolve(
    packageRoot,
    '../fixtures/src/system-worker/systems/system.ts',
  ),
  config,
  workerBindings: {
    ZEROSPIN_ENVIRONMENT: 'production',
    ZEROSPIN_PUBLISHABLE_KEY: 'pk_live_production_test',
    ZEROSPIN_SECRET_KEY: 'sk_live_production_test',
  },
  workerMainPath: path.join(packageRoot, 'src/ProductionWorker.ts'),
});
