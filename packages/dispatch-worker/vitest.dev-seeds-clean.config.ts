import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeWorkerdVitestConfig } from '@zerospin/dispatch-worker/vitest/makeWorkerdVitestConfig';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/DevZerospinApis.clean.workerd.spec.ts'],
  packageRoot,
  passWithNoTests: false,
  seedsModulePath: path.join(
    packageRoot,
    'tests/workerd/devSeeds.fixture.ts',
  ),
  systemModulePath: path.resolve(
    packageRoot,
    '../system-worker/src/fixtures/system.ts',
  ),
  wranglerConfigPath: path.join(
    packageRoot,
    'wrangler.dev-seeds-clean.vitest.jsonc',
  ),
  workerMainPath: path.join(
    packageRoot,
    'tests/workerd/DevZerospinApis.fixture.worker.ts',
  ),
});
