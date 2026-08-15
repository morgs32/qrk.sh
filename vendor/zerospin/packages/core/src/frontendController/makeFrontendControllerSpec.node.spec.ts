import { describe, expect, it } from 'vitest';

import { makeFrontendController } from './makeFrontendController.ts';
import { makeFrontendControllerSpec } from './makeFrontendControllerSpec.ts';

describe('makeFrontendControllerSpec', () => {
  it('serializes an aggregate frontend controller without frontend SemVer', () => {
    const controller = makeFrontendController({
      systemName: 'test-system',
      aggregateName: 'user',
      frontendName: 'web',
      models: {},
      contracts: {},
    });

    const spec = makeFrontendControllerSpec(controller);
    expect(spec).toMatchObject({
      kind: 'aggregate',
      systemName: 'test-system',
      aggregateName: 'user',
      frontendName: 'web',
      modelNames: [],
      models: {},
      contracts: {},
      aggregateFrontendLock: { models: {}, contracts: {} },
    });
    expect('version' in spec).toBe(false);
    expect('signature' in spec).toBe(false);
    expect('userIdJsonSchema' in spec).toBe(false);
  });

  it('serializes a service frontend controller through the same spec shape', () => {
    const controller = makeFrontendController({
      systemName: 'test-system',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: {},
    });

    const spec = makeFrontendControllerSpec(controller);
    expect(spec).toMatchObject({
      kind: 'service',
      systemName: 'test-system',
      serviceName: 'catalog',
      frontendName: 'browse',
      modelNames: [],
      models: {},
      contracts: {},
      serviceFrontendLock: { models: {} },
    });
    expect('version' in spec).toBe(false);
    expect('signature' in spec).toBe(false);
    expect('userIdJsonSchema' in spec).toBe(false);
  });
});
