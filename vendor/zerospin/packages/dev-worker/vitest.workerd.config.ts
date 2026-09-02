import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/DevWorker.system-repo.workerd.spec.ts'],
  packageRoot,
  passWithNoTests: false,
  systemModulePath: path.resolve(
    packageRoot,
    '../system-worker/src/fixtures/system.ts',
  ),
  wranglerConfigPath: path.join(packageRoot, 'wrangler.vitest.jsonc'),
  workerMainPath: path.join(packageRoot, 'src/DevWorker.ts'),
});
