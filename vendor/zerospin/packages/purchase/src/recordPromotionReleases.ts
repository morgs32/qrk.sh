import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IIdentitySchema } from '@zerospin/core/identity/types';
import { makeAbbreviationIdSchema, primitives } from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import type { IPurchaseHostModels } from './host.js';
import { type makeRecordWorkflowPromotion } from './recordWorkflowPromotion.js';
export const makeRecordPromotionReleases = <
  const HOST extends IPurchaseHostModels,
  const IDENTITY extends IIdentitySchema,
  const SELECTION extends IIdentitySchema,
>(
  selectionIdentitySchema: SELECTION,
  recordWorkflowPromotion: ReturnType<
    typeof makeRecordWorkflowPromotion<HOST, IDENTITY, SELECTION>
  >,
) => {
  const recordPromotionReleases = makeContractVersion(
    defineContract('recordPromotionReleases'),
    {
      version: '1.0.0',
      identity: selectionIdentitySchema,
      models: recordWorkflowPromotion.models,
      failures: recordWorkflowPromotion.failures,
      payload: {
        receipts: primitives.json({
          schema: Schema.Array(
            Schema.Struct({
              checkoutId: makeAbbreviationIdSchema('chk'),
              id: makeAbbreviationIdSchema('prv'),
              status: Schema.Literal('released'),
              expiresAt: Schema.NullOr(Schema.Number),
              purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
              finalizeRemoval: Schema.Boolean,
            }),
          ),
        }),
      },
      guard: Effect.fn(function* (props) {
        for (const payload of props.payload.receipts) {
          yield* recordWorkflowPromotion.guard!({ ...props, payload });
        }
      }),
      program: ({ payload, identity }) =>
        Effect.forEach(payload.receipts, receipt =>
          recordWorkflowPromotion.program({ payload: receipt, identity }),
        ).pipe(Effect.map(groups => groups.flat())),
    },
  );

  return recordPromotionReleases;
};
