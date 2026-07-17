import { makeWorkerdVitestConfig } from '@zerospin/dispatch-worker/vitest/makeWorkerdVitestConfig';

export default makeWorkerdVitestConfig({
  include: ['tests/workerd/**/*.zspec.ts'],
  passWithNoTests: false,
});
