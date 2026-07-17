import type { Plugin } from '@vitest/pretty-format';

import { ZerospinError } from '../ZerospinError.js';

export const errorSerializer: Plugin = {
  serialize(val: ZerospinError) {
    return `[Error ${val.message}]`;
  },
  test(val) {
    return val instanceof ZerospinError;
  },
};
