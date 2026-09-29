import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { makeModelMutations } from '@zerospin/core/contracts/make/makeModelMutations';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeFulfillmentServiceModuleV1 } from './server.js';

describe('fulfillment service factory', () => {
  it('keeps final references and applies the warehouse default in the creation mutation', async () => {
    const module = makeFulfillmentServiceModuleV1({
      models: {
        fulfillment: {
          version: '1.1.0',
          fields: { warehouseCode: primitives.text() },
          defaults: { warehouseCode: 'aus-01' },
        },
      },
      contracts: {
        markPacked: {
          version: '1.1.0',
          payload: { warehouseCode: primitives.text() },
          extend: ({ models, payload, fulfillmentId }) =>
            models.fulfillment.update({
              resourceId: fulfillmentId,
              attributes: { warehouseCode: payload.warehouseCode },
            }),
        },
      },
    });
    expect(module.contracts.markPacked.previous?.version).toBe('1.0.0');
    expect(module.contracts.requestFulfillment.models.fulfillment).toBe(
      module.models.fulfillment,
    );
    const models = {
      fulfillment: makeModelMutations(module.models.fulfillment),
    };
    const created = await Effect.runPromise(
      module.contracts.requestFulfillment.program({
        claims: null,
        failures: {},
        models,
        payload: {
          fulfillmentId: 'ful_1',
          requestId: 'req_1',
          aggregateId: 'acct_1',
          userId: 'usr_1',
          purchaseId: 'pur_1',
        },
      }),
    );
    expect(created).toMatchObject([
      { operation: { attributes: { warehouseCode: 'aus-01' } } },
    ]);
    const packed = await Effect.runPromise(
      module.contracts.markPacked.program({
        claims: null,
        failures: {},
        models,
        payload: { fulfillmentId: 'ful_1', warehouseCode: 'aus-02' },
      }),
    );
    expect(packed).toMatchObject([
      { operation: { attributes: { status: 'packed' } } },
      { operation: { attributes: { warehouseCode: 'aus-02' } } },
    ]);
  });

  it('uses replacement mutations without running the normal program', async () => {
    const module = makeFulfillmentServiceModuleV1({
      contracts: {
        markPacked: {
          version: '1.1.0',
          replace: ({ models, fulfillmentId }) =>
            Effect.map(
              models.fulfillment.update({
                resourceId: fulfillmentId,
                attributes: { status: 'shipped' },
              }),
              mutation => [mutation],
            ),
        },
      },
    });
    const result = await Effect.runPromise(
      module.contracts.markPacked.program({
        claims: null,
        failures: {},
        models: { fulfillment: makeModelMutations(module.models.fulfillment) },
        payload: { fulfillmentId: 'ful_1' },
      }),
    );
    expect(result).toMatchObject([
      { operation: { attributes: { status: 'shipped' } } },
    ]);
    expect(result).toHaveLength(1);
  });

  it('upgrades older request and packing commands into the warehouse composition', async () => {
    const module = makeFulfillmentServiceModuleV1({
      models: {
        fulfillment: {
          version: '1.1.0',
          fields: { warehouseCode: primitives.text() },
          defaults: { warehouseCode: 'aus-01' },
        },
      },
      contracts: {
        markPacked: {
          version: '1.1.0',
          payload: { warehouseCode: primitives.text() },
        },
      },
    });
    const request = await Effect.runPromise(
      decodePayload(module.contracts.requestFulfillment, {
        command: {
          id: 'cmd_request_old',
          commandName: 'requestFulfillment',
          contractVersion: '1.0.0',
          payload: JSON.stringify({
            fulfillmentId: 'ful_old',
            requestId: 'req_old',
            aggregateId: 'acct_old',
            userId: 'usr_old',
            purchaseId: 'pur_old',
          }),
        },
      }),
    );
    const packed = await Effect.runPromise(
      decodePayload(module.contracts.markPacked, {
        command: {
          id: 'cmd_pack_old',
          commandName: 'markPacked',
          contractVersion: '1.0.0',
          payload: JSON.stringify({ fulfillmentId: 'ful_old' }),
        },
      }),
    );
    expect(packed).toMatchObject({ warehouseCode: 'aus-01' });
    const created = await Effect.runPromise(
      module.contracts.requestFulfillment.program({
        claims: null,
        failures: {},
        models: { fulfillment: makeModelMutations(module.models.fulfillment) },
        payload: request,
      }),
    );
    expect(created).toMatchObject([
      { operation: { attributes: { warehouseCode: 'aus-01' } } },
    ]);
  });
  it('rejects unsupported and mutually exclusive options at the JavaScript boundary', () => {
    expect(() =>
      Reflect.apply(makeFulfillmentServiceModuleV1, undefined, [
        { unsupported: true },
      ]),
    ).toThrow();
    expect(() =>
      Reflect.apply(makeFulfillmentServiceModuleV1, undefined, [
        {
          contracts: {
            markPacked: {
              version: '1.1.0',
              replace: () => Effect.succeed([]),
              extend: () => Effect.succeed([]),
            },
          },
        },
      ]),
    ).toThrow('mutually exclusive');
  });
});
