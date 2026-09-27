import { makeAutomation } from '@zerospin/core/automation/makeAutomation';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  makeContractVersion,
  type IMutations,
} from '@zerospin/core/contracts/make/makeContractVersion';
import type { IContract } from '@zerospin/core/contracts/types';
import type { IIdentitySchema } from '@zerospin/core/identity/types';
import type { IModel } from '@zerospin/core/models/types';
import { ContractError, makeZerospinError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  primitives,
  type IAnyShape,
} from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { fulfillmentStateConflict } from './failures.js';
import { FulfillmentClient } from './FulfillmentClient.js';
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
  const IDENTITY extends IIdentitySchema,
  const SELECTION extends IIdentitySchema,
  const PAID extends IPaid,
>(options: {
  frontend: ReturnType<typeof makeFulfillmentFrontendModule<HOST, IDENTITY>>;
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
      identity: selectionIdentitySchema,
      models,
      failures: {
        aggregateConflict: fulfillmentStateConflict,
        conflict: ContractError.schema({
          code: 'fulfillment-enrollment-conflict',
        }),
      },
      payload: { fulfillment: primitives.json({ schema: sourceSchema }) },
      guard: Effect.fn(function* ({ queryDb, identity, payload, failures }) {
        const row = payload.fulfillment;
        const owner = resolvePurchaseOwner({
          queryDb,
          identity,
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
      identity: selectionIdentitySchema,
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
      guard: Effect.fn(function* ({ queryDb, identity, payload, failures }) {
        const row = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillment.resourceSchema)),
        )(queryDb.query.fulfillment.findMany().sync()).find(
          row => row.id === payload.fulfillmentId,
        );
        const operation = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillmentOperation.resourceSchema)),
        )(queryDb.query.fulfillmentOperation.findMany().sync()).find(
          row => row.id === payload.id,
        );
        const owner =
          row === undefined
            ? undefined
            : resolvePurchaseOwner({
                queryDb,
                identity,
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
  const requestPaidFulfillment = makeAutomation({
    name: 'requestPaidFulfillment',
    on: options.paid,
    contracts: { enrollFulfillment },
    program: Effect.fn(function* ({ db, on, contracts }) {
      if (!('aggregateId' in on) || on.payload.outcome !== 'succeeded') {
        return null;
      }
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.Struct({
            id: makeAbbreviationIdSchema('chk'),
            userId: makeAbbreviationIdSchema('usr'),
            purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
            status: Schema.String,
          }),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (
        checkout?.status !== 'paid' ||
        checkout.purchaseId === null ||
        checkout.purchaseId !== on.payload.purchaseId
      ) {
        return null;
      }
      const client = yield* FulfillmentClient;
      const result = yield* client.request({
        serviceVersion: fulfillment.serviceVersion,
        requestId: `purchase:${checkout.purchaseId}`,
        purchaseId: checkout.purchaseId,
        userId: checkout.userId,
        aggregateId: on.aggregateId,
      });
      if (result.kind === 'rejected') {
        return yield* makeZerospinError({
          code: 'fulfillment-request-rejected',
          message: result.reason,
        });
      }
      return contracts.enrollFulfillment({ fulfillment: result.fulfillment });
    }),
  });
  const makeOperation = <
    const NAME extends 'packFulfillment' | 'shipFulfillment',
  >(
    name: NAME,
    on: typeof requestPacking | typeof requestShipping,
  ) =>
    makeAutomation({
      name,
      on,
      contracts: { recordFulfillmentOperation },
      program: Effect.fn(function* ({ db, on, contracts }) {
        const row = Schema.decodeUnknownSync(
          Schema.toType(Schema.Array(fulfillment.resourceSchema)),
        )(db.query.fulfillment.findMany().sync()).find(
          row => row.id === on.payload.fulfillmentId,
        );
        if (row === undefined) return null;
        const client = yield* FulfillmentClient;
        const action = name === 'packFulfillment' ? 'pack' : 'ship';
        const result = yield* client.operate({
          serviceVersion: fulfillment.serviceVersion,
          operationId: on.payload.id,
          fulfillmentId: row.id,
          action,
          requestId: row.requestId,
          purchaseId: row.purchaseId,
          userId: row.userId,
          aggregateId: row.aggregateId,
        });
        return contracts.recordFulfillmentOperation({
          id: on.payload.id,
          fulfillmentId: row.id,
          action,
          status: result.kind === 'confirmed' ? 'succeeded' : 'failed',
          failure: result.kind === 'rejected' ? result.reason : null,
          fulfillment: result.kind === 'confirmed' ? result.fulfillment : null,
        });
      }),
    });
  const packFulfillment = makeOperation('packFulfillment', requestPacking);
  const shipFulfillment = makeOperation('shipFulfillment', requestShipping);
  return {
    models: frontend.models,
    contracts: {
      requestPacking,
      requestShipping,
      enrollFulfillment,
      recordFulfillmentOperation,
    },
    automations: { requestPaidFulfillment, packFulfillment, shipFulfillment },
  };
};
