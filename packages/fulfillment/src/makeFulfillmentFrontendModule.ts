import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import type { IIdentitySchema } from '@zerospin/core/identity/types';
import type { IModel } from '@zerospin/core/models/types';
import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { fulfillmentStateConflict } from './failures.js';
import type { makeFulfillmentModelV1 } from './portable.js';

export type IFulfillmentOwner = {
  userId: string;
  aggregateId: string;
  status: string;
};
export type IFulfillmentOwnership<
  HOST extends { purchase: IModel; user: IModel; cart: IModel },
  IDENTITY extends IIdentitySchema,
> = (props: {
  queryDb: Readonly<
    Pick<
      IDb<
        IResourceDbConfig<
          {
            purchase: HOST['purchase'];
            user: HOST['user'];
            cart: HOST['cart'];
          },
          Record<never, never>
        >
      >,
      'query'
    >
  >;
  identity: IDENTITY['Type'];
  purchaseId: string;
}) => IFulfillmentOwner | undefined;

export const makeFulfillmentFrontendModule = <
  const HOST extends { purchase: IModel; user: IModel; cart: IModel },
  const IDENTITY extends IIdentitySchema,
>(options: {
  models: HOST;
  source: {
    name: 'fulfillment';
    version: string;
    models: { fulfillment: ReturnType<typeof makeFulfillmentModelV1> };
  };
  identitySchema: IDENTITY;
  resolvePurchaseOwner: IFulfillmentOwnership<HOST, IDENTITY>;
}) => {
  const {
    models: host,
    source,
    identitySchema,
    resolvePurchaseOwner,
  } = options;
  const purchase: HOST['purchase'] = host.purchase;
  const user: HOST['user'] = host.user;
  const cart: HOST['cart'] = host.cart;
  const fulfillment = sdk.makeReplica({
    sourceModel: source.models.fulfillment,
    serviceName: source.name,
    serviceVersion: source.version,
  });
  const fulfillmentOperation = sdk.makeModelVersion(
    sdk.defineModel({ name: 'fulfillmentOperation', abbreviation: 'fop' }),
    {
      version: '1.0.0',
      attributes: {
        fulfillmentId: sdk.primitives.ref({
          table: fulfillment.table,
          relation: 'fulfillment',
          inverse: 'operations',
          nullable: false,
        }),
        action: sdk.primitives.enum({ values: ['pack', 'ship'] }),
        status: sdk.primitives.enum({
          values: ['requested', 'succeeded', 'failed'],
        }),
        failure: sdk.primitives.text({ nullable: true }),
      },
      indexes: [],
    },
  );
  const makeRequest = <const NAME extends 'requestPacking' | 'requestShipping'>(
    name: NAME,
    action: 'pack' | 'ship',
  ) =>
    sdk.makeContractVersion(sdk.defineContract(name), {
      version: '1.0.0',
      identity: identitySchema,
      models: { purchase, user, cart, fulfillment, fulfillmentOperation },
      payload: {
        id: sdk.primitives.foreignKey({ abbreviation: 'fop' }),
        fulfillmentId: sdk.primitives.foreignKey({ abbreviation: 'ful' }),
      },
      failures: {
        aggregateConflict: fulfillmentStateConflict,
        conflict: sdk.ContractError.schema({
          code: 'fulfillment-operation-conflict',
        }),
      },
      guard: Effect.fn(function* ({ queryDb, identity, payload, failures }) {
        const row = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillment.resourceSchema)),
        )(queryDb.query.fulfillment.findMany().sync()).find(
          row => row.id === payload.fulfillmentId,
        );
        const operations = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillmentOperation.resourceSchema)),
        )(queryDb.query.fulfillmentOperation.findMany().sync());
        const owner =
          row === undefined
            ? undefined
            : resolvePurchaseOwner({
                queryDb,
                identity,
                purchaseId: row.purchaseId,
              });
        if (
          row === undefined ||
          owner === undefined ||
          owner.status !== 'paid' ||
          row.userId !== owner.userId ||
          row.aggregateId !== owner.aggregateId ||
          row.status !== (action === 'pack' ? 'requested' : 'packed') ||
          operations.some(operation => operation.id === payload.id) ||
          operations.some(
            operation =>
              operation.fulfillmentId === row.id &&
              operation.status === 'requested',
          )
        ) {
          return yield* failures.conflict.make({
            message:
              'Fulfillment ownership or state changed. Review and retry.',
          });
        }
      }),
      program: ({ payload, models }) =>
        models.fulfillmentOperation
          .create({
            resourceId: payload.id,
            attributes: {
              fulfillmentId: payload.fulfillmentId,
              action,
              status: 'requested',
              failure: null,
            },
          })
          .pipe(Effect.map(mutation => [mutation])),
    });
  const requestPacking = makeRequest('requestPacking', 'pack');
  const requestShipping = makeRequest('requestShipping', 'ship');
  return {
    models: { fulfillment, fulfillmentOperation },
    contracts: { requestPacking, requestShipping },
    automations: {},
  };
};
