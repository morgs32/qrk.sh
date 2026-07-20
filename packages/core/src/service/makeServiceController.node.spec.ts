import { describe, expect, it } from 'vitest';

import { makeServiceController } from './makeServiceController.ts';

describe('makeServiceController', () => {
  it('rejects a missing version before model and contract validation', () => {
    const props = {
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: {},
    };
    Reflect.deleteProperty(props, 'version');

    expect(() => makeServiceController(props)).toThrow(
      'makeServiceController: version must be a non-empty string',
    );
  });

  it('rejects an empty version before model and contract validation', () => {
    const props = {
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: {},
    };
    Reflect.set(props, 'version', '');

    expect(() => makeServiceController(props)).toThrow(
      'makeServiceController: version must be a non-empty string',
    );
  });
});
