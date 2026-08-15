import path from 'node:path';

import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';

export default makeWorkerdVitestConfig({
  include: ['tests/**/*.workerd.spec.ts'],
  passWithNoTests: false,
  systemModulePath: path.join(import.meta.dirname, 'src/system.ts'),
  wranglerConfigPath: './wrangler.vitest.jsonc',
});
