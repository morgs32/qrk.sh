import { makeWorkerdVitestConfig } from '@zerospin/dev-worker/vitest/makeWorkerdVitestConfig';

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/**/*.spec.ts'],
  passWithNoTests: false,
  wranglerConfigPath: './wrangler.vitest.jsonc',
});
