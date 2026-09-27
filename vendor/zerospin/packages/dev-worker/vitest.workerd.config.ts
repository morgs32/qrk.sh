import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';
import config from '@zerospin/fixtures/system-worker/systems/system';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/DevWorker.system-repo.workerd.spec.ts'],
  packageRoot,
  passWithNoTests: false,
  configModulePath: path.resolve(
    packageRoot,
    '../fixtures/src/system-worker/systems/system.ts',
  ),
  config,
  workerMainPath: path.join(packageRoot, 'src/DevWorker.ts'),
});
