import type { Plugin } from '@vitest/pretty-format';

import { get } from '../../utils/get.ts';
import type { IDecodedResource } from '../types.ts';

export const mutationSerializer: Plugin = {
  serialize() {
    return `[Mutation]`;
  },
  test(val) {
    return Boolean(val) && Object.prototype.hasOwnProperty.call(val, 'patches');
  },
};

export const resourceSerializer: Plugin = {
  serialize(val: IDecodedResource, config, indentation, depth, refs, printer) {
    return printer(
      {
        ...val,
        createdAt: `[Date]`,
        updatedAt: `[Date]`,
      },
      config,
      indentation,
      depth,
      refs,
    );
  },
  test(val: unknown) {
    return (
      get(val, ['model']) !== undefined &&
      get(val, ['id']) !== undefined &&
      get(val, ['createdAt']) !== undefined &&
      get(val, ['updatedAt']) !== undefined &&
      get(val, ['createdAt']) !== '[Date]'
    );
  },
};
