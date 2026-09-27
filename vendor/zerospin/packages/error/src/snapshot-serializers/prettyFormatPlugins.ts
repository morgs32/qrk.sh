import { formatZerospinError, isZerospinError } from '../makeZerospinError.js';
import type { IAnyError } from '../types.js';

export const errorSerializer = {
  serialize: (value: IAnyError) => `[Error ${formatZerospinError(value)}]`,
  test: isZerospinError,
};
