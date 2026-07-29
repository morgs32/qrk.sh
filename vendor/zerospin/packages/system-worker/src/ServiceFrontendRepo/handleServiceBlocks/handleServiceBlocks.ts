import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape, IRef } from '@zerospin/core/models/types';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendBlock } from '@zerospin/core/serviceSession/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

/*
 * 1. Validate target and load the one projection watermark.
 * 2. Require source ServiceBlocks in exact index order.
 * 3. Accept a retry only when its retained canonical source bytes match.
 * 4. Apply only declared service models and collect the final resource delta.
 * 5. Advance the source watermark for every block, including irrelevant ones.
 * 6. Emit one contiguous frontend block only for a relevant live block.
 */
export const handleServiceBlocks = Effect.fn(
  'ServiceFrontendRepo.handleServiceBlocks',
)(function* (props: {
  serviceName: string;
  blocks: readonly IServiceBlock[];
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError> {
  const { blocks, db, key, serviceName } = props;
  if (serviceName !== key.serviceName) {
    return yield* new ZerospinError({
      code: 'service-frontend-block-service-mismatch',
      message: `ServiceFrontendRepo belongs to service "${key.serviceName}", not "${serviceName}"`,
    });
  }
  const serviceController = yield* getByKeyOrThrow({
    record: system.serviceControllers,
    key: key.serviceName,
    recordKind: 'service controllers',
  });
  const actorController = yield* getByKeyOrThrow({
    record: serviceController.actorControllers,
    key: key.actorName,
    recordKind: `actor controllers owned by service ${key.serviceName}`,
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: actorController.frontends,
    key: key.frontendName,
    recordKind: `frontends owned by service actor ${key.serviceName}.${key.actorName}`,
  });

  const canonicalBlocks: Array<{
    block: IServiceBlock;
    canonicalBytes: string;
  }> = [];
  for (const block of blocks) {
    if (!Number.isInteger(block.serviceIndex) || block.serviceIndex < 1) {
      return yield* new ZerospinError({
        code: 'service-frontend-source-index-invalid',
        message: `Service frontend source index must be a positive integer, received ${block.serviceIndex}`,
      });
    }
    canonicalBlocks.push({
      block,
      canonicalBytes: yield* Schema.encode(
        Schema.parseJson(ServiceBlockSchema),
      )(block).pipe(
        mapParseError({
          code: 'service-frontend-source-block-encode-failed',
          prefix: `Failed to encode service frontend source block ${block.serviceIndex}`,
        }),
      ),
    });
  }

  yield* makeTx({
    db,
    program: Effect.fn('ServiceFrontendRepo.handleServiceBlocks.transaction')(
      function* ({ tx }) {
        // 1 — an upstream delivery cannot create an uninitialized projection.
        const state = tx
          .select()
          .from(serviceFrontendRepoDrizzleSchemas.projectionState)
          .where(
            eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
          )
          .get();
        if (state === undefined) {
          return yield* new ZerospinError({
            code: 'service-frontend-projection-state-required',
            message:
              'ServiceFrontendRepo must install a snapshot before receiving service blocks',
          });
        }
        if (
          state.generationId !== key.generationId ||
          state.serviceName !== key.serviceName ||
          state.actorName !== key.actorName ||
          state.actorId !== key.actorId ||
          state.frontendName !== key.frontendName
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-projection-state-mismatch',
            message:
              'Stored ServiceFrontendRepo projection metadata does not match its repository key',
          });
        }
        if (state.emissionMode === 'read-only' && canonicalBlocks.length > 0) {
          return yield* new ZerospinError({
            code: 'service-frontend-projection-read-only',
            message:
              'A read-only ServiceFrontendRepo cannot accept source blocks',
          });
        }

        let currentServiceIndex = state.serviceIndex;
        let frontendIndex = state.frontendIndex;
        for (const encoded of canonicalBlocks) {
          // 2 — only exact-next source indices may mutate this projection.
          const expectedServiceIndex = (currentServiceIndex ?? 0) + 1;
          if (encoded.block.serviceIndex < expectedServiceIndex) {
            // 3 — a lost RPC response may replay a committed source block.
            const receipt = tx
              .select()
              .from(serviceFrontendRepoDrizzleSchemas.serviceBlockReceipts)
              .where(
                eq(
                  serviceFrontendRepoDrizzleSchemas.serviceBlockReceipts
                    .serviceIndex,
                  encoded.block.serviceIndex,
                ),
              )
              .get();
            if (
              receipt !== undefined &&
              receipt.lastServiceCursor === encoded.block.lastServiceCursor &&
              receipt.canonicalBytes === encoded.canonicalBytes
            ) {
              continue;
            }
            return yield* new ZerospinError({
              code: 'service-frontend-source-conflicting-duplicate',
              message: `Service frontend source index ${encoded.block.serviceIndex} is stale without identical retained bytes`,
            });
          }
          if (encoded.block.serviceIndex !== expectedServiceIndex) {
            return yield* new ZerospinError({
              code: 'service-frontend-source-index-gap',
              message: `Service frontend source expected index ${expectedServiceIndex}, received ${encoded.block.serviceIndex}`,
            });
          }

          // 4 — record whether each affected row existed before this block,
          // then read its one final encoded value after all source mutations.
          const affectedResources = new Map<
            string,
            Readonly<{
              id: string;
              modelName: string;
              existedBeforeBlock: boolean;
            }>
          >();
          for (const mutation of encoded.block.appliedMutations) {
            const model =
              frontendBinding.frontendController.models[mutation.modelName];
            if (model === undefined) {
              continue;
            }
            const affectedKey = `${mutation.modelName}:${mutation.resourceId}`;
            if (!affectedResources.has(affectedKey)) {
              affectedResources.set(affectedKey, {
                id: mutation.resourceId,
                modelName: mutation.modelName,
                existedBeforeBlock:
                  tx
                    .select({ id: model.drizzleSchema.id })
                    .from(model.drizzleSchema)
                    .where(eq(model.drizzleSchema.id, mutation.resourceId))
                    .get() !== undefined,
              });
            }
            yield* commitAppliedMutationTx({
              tx,
              models: frontendBinding.frontendController.models,
              mutation,
            });
          }

          const inserted: IEncodedResourceShape[] = [];
          const updated: IEncodedResourceShape[] = [];
          const deleted: IRef[] = [];
          for (const affected of affectedResources.values()) {
            const model = yield* getByKeyOrThrow({
              record: frontendBinding.frontendController.models,
              key: affected.modelName,
              recordKind: 'service frontend models',
            });
            const row = tx
              .select()
              .from(model.drizzleSchema)
              .where(eq(model.drizzleSchema.id, affected.id))
              .get();
            if (row === undefined) {
              deleted.push({ id: affected.id, modelName: affected.modelName });
              continue;
            }
            const resource = yield* Schema.validate(EncodedResourceSchema)(
              row,
            ).pipe(
              mapParseError({
                code: 'service-frontend-convergence-resource-invalid',
                prefix: `Failed to decode converged service frontend resource ${affected.modelName}.${affected.id}`,
              }),
            );
            if (affected.existedBeforeBlock) {
              updated.push(resource);
            } else {
              inserted.push(resource);
            }
          }

          // 5 — cursor provenance advances even when the frontend saw no row.
          currentServiceIndex = encoded.block.serviceIndex;
          tx.update(serviceFrontendRepoDrizzleSchemas.projectionState)
            .set({
              lastServiceCursor: encoded.block.lastServiceCursor,
              serviceIndex: encoded.block.serviceIndex,
            })
            .where(
              eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
            )
            .run();
          tx.insert(serviceFrontendRepoDrizzleSchemas.serviceBlockReceipts)
            .values({
              lastServiceCursor: encoded.block.lastServiceCursor,
              serviceIndex: encoded.block.serviceIndex,
              canonicalBytes: encoded.canonicalBytes,
              block: encoded.canonicalBytes,
            })
            .run();

          // 6 — no-emission successor preparation applies source truth without
          // manufacturing a target-generation frontend block.
          if (
            affectedResources.size === 0 ||
            state.emissionMode === 'no-emission'
          ) {
            continue;
          }
          frontendIndex += 1;
          const frontendBlock = {
            serviceName: key.serviceName,
            actorName: key.actorName,
            actorId: state.actorId,
            frontendName: key.frontendName,
            frontendIndex,
            lastServiceCursor: encoded.block.lastServiceCursor,
            delta: { inserted, updated, deleted },
          } satisfies IServiceFrontendBlock;
          const encodedFrontendBlock = yield* Schema.encode(
            Schema.parseJson(ServiceFrontendBlockSchema),
          )(frontendBlock).pipe(
            mapParseError({
              code: 'service-frontend-block-encode-failed',
              prefix: `Failed to encode service frontend block ${frontendIndex}`,
            }),
          );
          tx.update(serviceFrontendRepoDrizzleSchemas.projectionState)
            .set({ frontendIndex })
            .where(
              eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'),
            )
            .run();
          tx.insert(
            serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox,
          )
            .values({
              frontendIndex,
              block: encodedFrontendBlock,
              publishedAt: null,
              failure: null,
            })
            .run();
        }
      },
    ),
  });
});
