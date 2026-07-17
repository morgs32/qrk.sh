import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import type { IEncodedAppliedMutation } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getLastAccountIndex } from '../../getLastAccountCursor/getLastAccountCursor.js';
import type { IAccountBlockOutboxRecord, IServiceBlock } from '../../types.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';
import { makeAccountBlockTx } from '../finalizeAccountBlock/makeAccountBlockTx.js';
import { upsertAccountBlockTx } from '../finalizeAccountBlock/upsertAccountBlockTx.js';

/*
 * 1. Resolve the account controller and open the delivery transaction.
 * 2. Load and validate the service subscription by serviceRepoName.
 * 3. Process only blocks newer than the one service watermark.
 * 4. Treat existing service-owned model rows as replication membership.
 * 5. Apply updates and deletes in source mutation order.
 * 6. Advance the subscription watermark through every processed block.
 * 7. Emit one commandless AccountBlock for each relevant ServiceBlock.
 */
export const handleServiceBlocks = Effect.fn('AccountRepo.handleServiceBlocks')(
  function* (props: {
    accountName: string;
    serviceRepoName: string;
    serviceName: string;
    blocks: readonly IServiceBlock[];
    db: IDb;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<void, IAnyError, CuidFactory | MonotonicFactory> {
    const {
      accountName,
      blocks,
      db,
      serviceName,
      serviceRepoName,
      storage,
    } = props;
    const persistedServiceRepoName = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.serviceRepo),
    )(serviceRepoName).pipe(
      mapParseError({
        code: 'account-service-repo-name-decode-failed',
        prefix: 'Failed to decode AccountRepo serviceRepoName',
      }),
    );

    // 1 — one controller supplies both ownership metadata and the local model tables
    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    yield* makeTx({
      db,
      program: Effect.fn('AccountRepo.handleServiceBlocks.transaction')(
        function* ({ tx }) {
          // 2 — repo name is row identity; serviceName remains an explicit routing invariant
          const subscription = tx
            .select()
            .from(accountRepoDrizzleSchemas.serviceSubscriptions)
            .where(
              eq(
                accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
                persistedServiceRepoName,
              ),
            )
            .get();
          if (subscription === undefined) {
            return yield* new ZerospinError({
              code: 'account-service-subscription-not-found',
              message: `AccountRepo is not subscribed to service "${serviceName}"`,
            });
          }
          if (subscription.serviceName !== serviceName) {
            return yield* new ZerospinError({
              code: 'account-service-subscription-name-mismatch',
              message: `Subscription ${serviceRepoName} belongs to service "${subscription.serviceName}", not "${serviceName}"`,
            });
          }

          let currentAccountIndex = yield* getLastAccountIndex({
            storage,
            defaultValue: 0,
          });
          let currentServiceIndex = subscription.currentServiceIndex;
          const orderedBlocks = [...blocks].sort(
            (left, right) => left.serviceIndex - right.serviceIndex,
          );

          // 3 — a delivery that waited behind alignment becomes an idempotent skip through committed W
          for (const block of orderedBlocks) {
            if (block.serviceIndex <= currentServiceIndex) {
              continue;
            }
            const relevantMutations: IEncodedAppliedMutation[] = [];

            for (const mutation of block.appliedMutations) {
              if (mutation.operationName === 'replicateResource') {
                continue;
              }
              // 4 — no duplicate registry or per-resource watermark exists; the model row is membership
              const model = yield* getByKeyOrThrow({
                record: accountController.models,
                key: mutation.modelName,
                recordKind: `models owned by account ${accountName}`,
              });
              if (
                !('serviceName' in model) ||
                model.serviceName !== serviceName
              ) {
                return yield* new ZerospinError({
                  code: 'replication-service-model-mismatch',
                  message: `Service block model "${mutation.modelName}" is not owned by service "${serviceName}"`,
                });
              }
              const existingResource = tx
                .select()
                .from(model.drizzleSchema)
                .where(eq(model.drizzleSchema.id, mutation.resourceId))
                .get();
              if (existingResource === undefined) {
                continue;
              }

              // 5 — a delete removes the row and therefore ends membership for this monotonic id
              yield* commitAppliedMutationTx({
                tx,
                models: accountController.models,
                mutation,
              });
              relevantMutations.push(mutation);
            }

            // 6 — irrelevant blocks still advance the complete service projection watermark
            currentServiceIndex = block.serviceIndex;
            tx.update(accountRepoDrizzleSchemas.serviceSubscriptions)
              .set({
                currentServiceCursor: block.lastServiceCursor,
                currentServiceIndex: block.serviceIndex,
              })
              .where(
                eq(
                  accountRepoDrizzleSchemas.serviceSubscriptions
                    .serviceRepoName,
                  persistedServiceRepoName,
                ),
              )
              .run();

            if (relevantMutations.length === 0) {
              continue;
            }

            // 7 — preserve source ServiceBlock boundaries as ordered commandless AccountBlocks
            currentAccountIndex += 1;
            const lastAccountCursor = yield* makeCursor({
              abbreviation: coreAbbreviations.accountCursor,
            });
            const accountBlock = yield* makeAccountBlockTx({
              accountName,
              pushedBlockId: null,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: relevantMutations,
              lastAccountCursor,
              accountIndex: currentAccountIndex,
              storage,
              tx,
            });
            const outboxRecord = {
              ...accountBlock,
              publishedAt: null,
              failure: null,
            } satisfies IAccountBlockOutboxRecord;
            yield* upsertAccountBlockTx({
              accountBlock: outboxRecord,
              tx,
            });
          }
        },
      ),
    });
  },
);
