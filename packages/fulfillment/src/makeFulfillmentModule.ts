import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  makeContractVersion,
  type IMutations,
} from '@zerospin/core/contracts/make/makeContractVersion';
import type { IContract } from '@zerospin/core/contracts/types';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import type { IModel } from '@zerospin/core/models/types';
import { ContractError } from '@zerospin/error';
import {
  primitives,
  type IAnyShape,
} from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { fulfillmentStateConflict } from './failures.js';
import type {
  IFulfillmentOwnership,
  makeFulfillmentFrontendModule,
} from './makeFulfillmentFrontendModule.js';

type IHost = { purchase: IModel; cart: IModel; user: IModel };
type IPaid = IContract<
  string,
  IAnyShape,
  string,
  IMutations,
  Record<string, IAnyShape>,
  { checkout: IModel }
>;
export const makeFulfillmentModule = <
  const HOST extends IHost,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
  const PAID extends IPaid,
>(options: {
  frontend: ReturnType<typeof makeFulfillmentFrontendModule<HOST, CLAIMS>>;
  paid: PAID;
  selectionIdentitySchema: SELECTION;
  resolvePurchaseOwner: IFulfillmentOwnership<HOST, SELECTION>;
}) => {
  const { frontend, selectionIdentitySchema, resolvePurchaseOwner } = options;
  const { fulfillment, fulfillmentOperation } = frontend.models;
  const { requestPacking, requestShipping } = frontend.contracts;
  const models = requestPacking.models;
  const sourceSchema = fulfillment.sourceModel.resourceSchema;
  const enrollFulfillment = makeContractVersion(
    defineContract('enrollFulfillment'),
    {
      version: '1.0.0',
      claims: selectionIdentitySchema,
      models,
      failures: {
        aggregateConflict: fulfillmentStateConflict,
        conflict: ContractError.schema({
          code: 'fulfillment-enrollment-conflict',
        }),
      },
      payload: { fulfillment: primitives.json({ schema: sourceSchema }) },
      guard: Effect.fn(function* ({ db, claims, payload, failures }) {
        const row = payload.fulfillment;
        const owner = resolvePurchaseOwner({
          db,
          claims,
          purchaseId: row.purchaseId,
        });
        if (
          owner === undefined ||
          owner.status !== 'paid' ||
          row.userId !== owner.userId ||
          row.aggregateId !== owner.aggregateId ||
          row.requestId !== `purchase:${row.purchaseId}`
        ) {
          return yield* failures.conflict.make({
            message: 'Fulfillment must match this user and paid purchase.',
          });
        }
      }),
      program: ({ models, payload }) =>
        models.fulfillment
          .replicate(payload.fulfillment)
          .pipe(Effect.map(mutation => [mutation])),
    },
  );
  const recordFulfillmentOperation = makeContractVersion(
    defineContract('recordFulfillmentOperation'),
    {
      version: '1.0.0',
      claims: selectionIdentitySchema,
      models,
      failures: {
        aggregateConflict: fulfillmentStateConflict,
        conflict: ContractError.schema({
          code: 'fulfillment-operation-conflict',
        }),
      },
      payload: {
        id: primitives.foreignKey({ abbreviation: 'fop' }),
        fulfillmentId: primitives.foreignKey({ abbreviation: 'ful' }),
        action: primitives.enum({ values: ['pack', 'ship'] }),
        status: primitives.enum({ values: ['succeeded', 'failed'] }),
        failure: primitives.text({ nullable: true }),
        fulfillment: primitives.json({
          schema: sourceSchema,
          nullable: true,
        }),
      },
      guard: Effect.fn(function* ({ db, claims, payload, failures }) {
        const row = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillment.resourceSchema)),
        )(db.query.fulfillment.findMany().sync()).find(
          row => row.id === payload.fulfillmentId,
        );
        const operation = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillmentOperation.resourceSchema)),
        )(db.query.fulfillmentOperation.findMany().sync()).find(
          row => row.id === payload.id,
        );
        const owner =
          row === undefined
            ? undefined
            : resolvePurchaseOwner({
                db,
                claims,
                purchaseId: row.purchaseId,
              });
        const result = payload.fulfillment;
        if (
          row === undefined ||
          operation === undefined ||
          owner === undefined ||
          owner.status !== 'paid' ||
          owner.userId !== row.userId ||
          owner.aggregateId !== row.aggregateId ||
          operation.fulfillmentId !== row.id ||
          operation.action !== payload.action ||
          (operation.status !== 'requested' &&
            (operation.status !== payload.status ||
              operation.failure !== payload.failure)) ||
          (payload.status === 'succeeded' &&
            (result === null ||
              result.id !== row.id ||
              result.purchaseId !== row.purchaseId ||
              result.requestId !== row.requestId ||
              result.userId !== row.userId ||
              result.aggregateId !== row.aggregateId ||
              (payload.action === 'ship'
                ? result.status !== 'shipped'
                : result.status !== 'packed' && result.status !== 'shipped')))
        ) {
          return yield* failures.conflict.make({
            message: 'Fulfillment outcome does not match this operation.',
          });
        }
      }),
      program: ({ models, payload }) =>
        models.fulfillmentOperation
          .update({
            resourceId: payload.id,
            attributes: { status: payload.status, failure: payload.failure },
          })
          .pipe(Effect.map(mutation => [mutation])),
    },
  );
  return {
    models: frontend.models,
    contracts: {
      requestPacking,
      requestShipping,
      enrollFulfillment,
      recordFulfillmentOperation,
    },
  };
};
