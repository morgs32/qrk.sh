/*
 * System-worker annotation:
 * Closes generation writes, drains every registered authoritative workflow in
 * dependency order, and captures immutable service/account replay bounds.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, isNull, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AccountBlockRepo } from '../../AccountBlockRepo/AccountBlockRepo.js';
import { getAccountBlockRepo } from '../../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { AccountRepo } from '../../AccountRepo/AccountRepo.js';
import { getAccountRepo } from '../../AccountRepo/getAccountRepo/getAccountRepo.js';
import { ActorBlockRepo } from '../../ActorBlockRepo/ActorBlockRepo.js';
import { getActorBlockRepo } from '../../ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
import { ActorRepo } from '../../ActorRepo/ActorRepo.js';
import { getActorRepo } from '../../ActorRepo/getActorRepo/getActorRepo.js';
import { FrontendBlockRepo } from '../../FrontendBlockRepo/FrontendBlockRepo.js';
import { getFrontendBlockRepo } from '../../FrontendBlockRepo/getFrontendBlockRepo/getFrontendBlockRepo.js';
import { FrontendRepo } from '../../FrontendRepo/FrontendRepo.js';
import { getFrontendRepo } from '../../FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { ServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getServiceFrontendRepo } from '../../ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo.js';
import { ServiceFrontendRepo } from '../../ServiceFrontendRepo/ServiceFrontendRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';

export const drainGeneration = Effect.fn('SystemRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    deployId: string;
    generationId: string;
    mode: 'freeze' | 'complete';
    successorGenerationId: string | null;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      admission: AnyColumn;
      drainFrozenAt: AnyColumn;
      generationId: AnyColumn;
      readiness: AnyColumn;
      successorGenerationId: AnyColumn;
    }>;
    drainBoundsTable: IAnyDrizzleSchema;
    drainBoundsColumns: Readonly<{
      deployId: AnyColumn;
      frontendBlockRepoName: AnyColumn;
      repoName: AnyColumn;
      repoType: AnyColumn;
      systemWorkerName: AnyColumn;
      terminalFrontendIndex: AnyColumn;
    }>;
    repoTable: IAnyDrizzleSchema;
    frontendWebSocketTicketTable: IAnyDrizzleSchema;
    serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
    generationWriteReservationTable: IAnyDrizzleSchema;
    generationWriteReservationColumns: Readonly<{
      operationName: AnyColumn;
      reservationId: AnyColumn;
      reservedAt: AnyColumn;
    }>;
  }): Effect.fn.Return<
    Readonly<{
      deployId: string;
      generationId: string;
      admission: 'draining' | 'drained';
    }>,
    IAnyError,
    Async
  > {
    const {
      db,
      deployId,
      drainBoundsColumns,
      drainBoundsTable,
      frontendWebSocketTicketTable,
      generationId,
      generationStateColumns,
      generationStateTable,
      generationWriteReservationColumns,
      generationWriteReservationTable,
      mode,
      repoTable,
      serviceFrontendWebSocketTicketTable,
      successorGenerationId,
    } = props;

    if (mode !== 'freeze' && mode !== 'complete') {
      return yield* new ZerospinError({
        code: 'generation-drain-mode-invalid',
        message: 'Generation drain mode must be freeze or complete',
        extra: { deployId, generationId, mode },
      });
    }
    if (
      (mode === 'freeze' && successorGenerationId !== null) ||
      (mode === 'complete' &&
        (successorGenerationId === null ||
          successorGenerationId === generationId))
    ) {
      return yield* new ZerospinError({
        code: 'generation-drain-successor-invalid',
        message:
          'Freeze requires no successor and completion requires a distinct successor generation',
        extra: { deployId, generationId, mode, successorGenerationId },
      });
    }

    // Checkpoint 1: only the generation-local active deploy can close admission.
    const rawGenerationState = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-drain-state-read-failed',
        message: 'Failed to read generation state before drain',
        extra: { deployId, generationId },
      }),
    });
    if (rawGenerationState === undefined) {
      return yield* new ZerospinError({
        code: 'generation-drain-not-prepared',
        message: 'The generation cannot drain before it is prepared',
        extra: { deployId, generationId },
      });
    }
    const generationState = yield* Schema.decodeUnknown(
      Schema.Struct({
        activeDeployId: Schema.NullOr(Schema.String),
        readiness: Schema.Literal('initializing', 'ready', 'failed'),
        admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
        drainFrozenAt: Schema.NullOr(Schema.DateFromSelf),
        successorGenerationId: Schema.NullOr(Schema.String),
      }),
    )(rawGenerationState).pipe(
      mapParseError({
        code: 'generation-drain-state-invalid',
        prefix: 'Stored generation state is invalid before drain',
        extra: { deployId, generationId },
      }),
    );
    if (generationState.activeDeployId !== deployId) {
      return yield* new ZerospinError({
        code: 'generation-drain-deploy-mismatch',
        message: 'Only the generation-local active deploy may drain',
        extra: {
          deployId,
          generationId,
          activeDeployId: generationState.activeDeployId,
        },
      });
    }
    if (generationState.readiness !== 'ready') {
      return yield* new ZerospinError({
        code: 'generation-drain-not-ready',
        message: 'Only a ready generation may drain',
        extra: {
          deployId,
          generationId,
          readiness: generationState.readiness,
        },
      });
    }
    if (mode === 'complete') {
      const successor = yield* Schema.decodeUnknown(Schema.String)(
        successorGenerationId,
      ).pipe(
        mapParseError({
          code: 'generation-drain-successor-required',
          prefix: 'Generation completion requires a successor generation',
          extra: { deployId, generationId },
        }),
      );
      if (
        generationState.admission === 'drained' &&
        generationState.successorGenerationId !== successor
      ) {
        return yield* new ZerospinError({
          code: 'generation-drain-successor-conflict',
          message: 'Completed generation already records a different successor',
          extra: {
            deployId,
            generationId,
            successorGenerationId: successor,
            storedSuccessorGenerationId: generationState.successorGenerationId,
          },
        });
      }
      if (generationState.admission !== 'drained') {
        if (
          generationState.admission !== 'draining' ||
          generationState.drainFrozenAt === null
        ) {
          return yield* new ZerospinError({
            code: 'generation-drain-not-frozen',
            message:
              'Generation drain cannot complete before its replay bounds are frozen',
            extra: {
              deployId,
              generationId,
              admission: generationState.admission,
              drainFrozenAt: generationState.drainFrozenAt,
            },
          });
        }

        yield* Effect.try({
          try: () =>
            db
              .update(generationStateTable)
              .set({
                admission: 'drained',
                drainedAt: new Date(),
                successorGenerationId: successor,
              })
              .where(
                and(
                  eq(generationStateColumns.generationId, generationId),
                  eq(generationStateColumns.activeDeployId, deployId),
                  eq(generationStateColumns.admission, 'draining'),
                ),
              )
              .run(),
          catch: ZerospinError.catch({
            code: 'generation-drain-complete-write-failed',
            message: 'Failed to mark generation drain complete',
            extra: { deployId, generationId },
          }),
        });
      }

      // The current account-frontend ticket table is cleanup state, not replay
      // history. A retry repeats this deletion after the durable drained write.
      yield* Effect.try({
        try: () => db.delete(frontendWebSocketTicketTable).run(),
        catch: ZerospinError.catch({
          code: 'frontend-websocket-ticket-drained-cleanup-failed',
          message: 'Failed to remove tickets from a drained generation',
          extra: { deployId, generationId },
        }),
      });
      yield* Effect.try({
        try: () => db.delete(serviceFrontendWebSocketTicketTable).run(),
        catch: ZerospinError.catch({
          code: 'service-frontend-websocket-ticket-drained-cleanup-failed',
          message:
            'Failed to remove service frontend tickets from a drained generation',
          extra: { deployId, generationId },
        }),
      });

      const frozenProjectionBounds = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(eq(drainBoundsColumns.deployId, deployId))
            .orderBy(asc(drainBoundsColumns.repoName))
            .all(),
        catch: ZerospinError.catch({
          code: 'generation-superseded-bounds-read-failed',
          message:
            'Failed to read frozen projection bounds for superseded signaling',
          extra: { deployId, generationId, successorGenerationId: successor },
        }),
      });
      for (const rawBound of frozenProjectionBounds) {
        const bound = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal(
              'ServiceBlockRepo',
              'AccountBlockRepo',
              'FrontendRepo',
              'ServiceFrontendRepo',
            ),
            frontendBlockRepoName: Schema.NullOr(Schema.String),
          }),
        )(rawBound).pipe(
          mapParseError({
            code: 'generation-superseded-bound-invalid',
            prefix:
              'Stored projection bound is invalid for superseded signaling',
            extra: { deployId, generationId },
          }),
        );
        if (bound.repoType === 'FrontendRepo') {
          if (bound.frontendBlockRepoName === null) {
            return yield* new ZerospinError({
              code: 'generation-superseded-account-archive-required',
              message:
                'Frozen account projection bound has no archive to supersede',
            });
          }
          const key = yield* FrontendBlockRepo.repoUtils.nameUtils.parseName(
            bound.frontendBlockRepoName,
          );
          const frontendBlockRepo = yield* getFrontendBlockRepo({ key });
          const signaledUnknown = yield* makeAsync(() =>
            frontendBlockRepo.generationSuperseded({
              successorGenerationId: successor,
            }),
          );
          const signaledEncoded = yield* Schema.decodeUnknown(
            Schema.Union(
              Schema.Struct({
                _tag: Schema.Literal('Right'),
                right: Schema.Undefined,
              }),
              Schema.Struct({
                _tag: Schema.Literal('Left'),
                left: Schema.encodedSchema(ZerospinError.schema),
              }),
            ),
          )(signaledUnknown).pipe(
            mapParseError({
              code: 'generation-superseded-account-rpc-invalid',
              prefix: 'Failed to decode FrontendBlockRepo superseded RPC',
            }),
          );
          yield* decodeRpc(signaledEncoded);
          continue;
        }
        if (bound.repoType === 'ServiceFrontendRepo') {
          if (bound.frontendBlockRepoName === null) {
            return yield* new ZerospinError({
              code: 'generation-superseded-service-archive-required',
              message:
                'Frozen service projection bound has no archive to supersede',
            });
          }
          const key =
            yield* ServiceFrontendBlockRepo.repoUtils.nameUtils.parseName(
              bound.frontendBlockRepoName,
            );
          const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({
            key,
          });
          const signaledUnknown = yield* makeAsync(() =>
            serviceFrontendBlockRepo.generationSuperseded({
              successorGenerationId: successor,
            }),
          );
          const signaledEncoded = yield* Schema.decodeUnknown(
            Schema.Union(
              Schema.Struct({
                _tag: Schema.Literal('Right'),
                right: Schema.Undefined,
              }),
              Schema.Struct({
                _tag: Schema.Literal('Left'),
                left: Schema.encodedSchema(ZerospinError.schema),
              }),
            ),
          )(signaledUnknown).pipe(
            mapParseError({
              code: 'generation-superseded-service-rpc-invalid',
              prefix:
                'Failed to decode ServiceFrontendBlockRepo superseded RPC',
            }),
          );
          yield* decodeRpc(signaledEncoded);
        }
      }

      return { deployId, generationId, admission: 'drained' };
    }

    // Freeze and reserve serialize through the same synchronous SQLite owner.
    // The transaction either observes a reservation already inserted or closes
    // admission before any later reservation can pass its own gate check.
    const admissionAlreadyFrozen = yield* Effect.try({
      try: (): boolean | IAnyError =>
        db.transaction(tx => {
          const latestGenerationState = tx
            .select({
              generationId: generationStateColumns.generationId,
              activeDeployId: generationStateColumns.activeDeployId,
              readiness: generationStateColumns.readiness,
              admission: generationStateColumns.admission,
              drainFrozenAt: generationStateColumns.drainFrozenAt,
            })
            .from(generationStateTable)
            .where(eq(generationStateColumns.generationId, generationId))
            .get();

          if (latestGenerationState === undefined) {
            return new ZerospinError({
              code: 'generation-drain-not-prepared',
              message: 'The generation cannot drain before it is prepared',
              extra: { deployId, generationId },
            });
          }
          if (latestGenerationState.generationId !== generationId) {
            return new ZerospinError({
              code: 'generation-drain-identity-mismatch',
              message: 'Stored generation state does not match this SystemRepo',
              extra: {
                deployId,
                generationId,
                storedGenerationId: latestGenerationState.generationId,
              },
            });
          }
          if (latestGenerationState.activeDeployId !== deployId) {
            return new ZerospinError({
              code: 'generation-drain-deploy-mismatch',
              message: 'Only the generation-local active deploy may drain',
              extra: {
                deployId,
                generationId,
                activeDeployId: latestGenerationState.activeDeployId,
              },
            });
          }
          if (latestGenerationState.readiness !== 'ready') {
            return new ZerospinError({
              code: 'generation-drain-not-ready',
              message: 'Only a ready generation may drain',
              extra: {
                deployId,
                generationId,
                readiness: latestGenerationState.readiness,
              },
            });
          }
          if (latestGenerationState.admission === 'drained') {
            return new ZerospinError({
              code: 'generation-drain-already-complete',
              message: 'A completed generation drain cannot be frozen again',
              extra: { deployId, generationId },
            });
          }
          if (
            latestGenerationState.admission !== 'open' &&
            latestGenerationState.admission !== 'draining'
          ) {
            return new ZerospinError({
              code: 'generation-drain-admission-closed',
              message: 'The generation is not open or already draining',
              extra: {
                deployId,
                generationId,
                admission: latestGenerationState.admission,
              },
            });
          }
          if (
            latestGenerationState.admission === 'draining' &&
            latestGenerationState.drainFrozenAt !== null
          ) {
            return true;
          }

          if (latestGenerationState.admission === 'open') {
            tx.update(generationStateTable)
              .set({
                admission: 'draining',
                drainFrozenAt: null,
                drainedAt: null,
              })
              .where(
                and(
                  eq(generationStateColumns.generationId, generationId),
                  eq(generationStateColumns.activeDeployId, deployId),
                  eq(generationStateColumns.admission, 'open'),
                ),
              )
              .run();
          }

          return false;
        }),
      catch: ZerospinError.catch({
        code: 'generation-drain-close-write-failed',
        message: 'Failed to close generation write admission',
        extra: { deployId, generationId },
      }),
    });
    if (ZerospinError.isZerospinError(admissionAlreadyFrozen)) {
      return yield* admissionAlreadyFrozen;
    }
    if (admissionAlreadyFrozen) {
      return { deployId, generationId, admission: 'draining' };
    }

    // Only reservations committed before the gate closed can remain. This
    // SystemRepo is already generation-scoped, so every row remains part of the
    // finite set even when compatible code reuse changes activeDeployId while
    // an older deploy's admitted operation is still running. Releases stay
    // admitted after closure and are idempotent, so poll until the complete
    // generation-local set is empty. A 30-second-old row is retained and
    // surfaced as an abandoned operation instead of being expired or silently
    // deleted.
    const writeReservationWaitStartedAt = Date.now();
    while (true) {
      const rawPendingWriteReservations = yield* Effect.try({
        try: () =>
          db
            .select({
              reservationId: generationWriteReservationColumns.reservationId,
              operationName: generationWriteReservationColumns.operationName,
              reservedAt: generationWriteReservationColumns.reservedAt,
            })
            .from(generationWriteReservationTable)
            .orderBy(
              asc(generationWriteReservationColumns.reservedAt),
              asc(generationWriteReservationColumns.reservationId),
            )
            .all(),
        catch: ZerospinError.catch({
          code: 'generation-write-reservation-read-failed',
          message: 'Failed to read admitted generation writes while freezing',
          extra: { deployId, generationId },
        }),
      });
      const pendingWriteReservations = yield* Schema.decodeUnknown(
        Schema.Array(
          Schema.Struct({
            reservationId: Schema.String,
            operationName: Schema.String,
            reservedAt: Schema.DateFromSelf,
          }),
        ),
      )(rawPendingWriteReservations).pipe(
        mapParseError({
          code: 'generation-write-reservation-state-invalid',
          prefix: 'Stored generation write reservation is invalid',
          extra: { deployId, generationId },
        }),
      );
      if (pendingWriteReservations.length === 0) {
        break;
      }

      const now = Date.now();
      const abandonedReservation = pendingWriteReservations.find(
        reservation => now - reservation.reservedAt.getTime() >= 30_000,
      );
      if (
        abandonedReservation !== undefined ||
        now - writeReservationWaitStartedAt >= 30_000
      ) {
        const blockingReservation =
          abandonedReservation ?? pendingWriteReservations[0];
        if (blockingReservation === undefined) {
          return yield* new ZerospinError({
            code: 'generation-write-reservation-state-invalid',
            message:
              'Generation write reservation count changed while reporting an abandoned operation',
            extra: { deployId, generationId },
          });
        }
        return yield* new ZerospinError({
          code: 'generation-write-reservation-abandoned',
          message:
            'An admitted generation write did not release before the finite drain deadline',
          extra: {
            deployId,
            generationId,
            reservationCount: pendingWriteReservations.length,
            reservationId: blockingReservation.reservationId,
            operationName: blockingReservation.operationName,
            reservedAt: blockingReservation.reservedAt.toISOString(),
          },
        });
      }

      yield* Effect.sleep(25);
    }

    // Checkpoint 2: each dependency level is fully drained before the next one
    // can create or publish downstream work.
    const frontendRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'FrontendRepo',
    });
    for (const registration of frontendRepos) {
      const key = yield* FrontendRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const frontendRepo = yield* getFrontendRepo({ key });
      const encoded = yield* makeAsync(() => frontendRepo.drainGeneration());
      const result = yield* decodeRpc(encoded);
      if (
        result.pendingPushedBlockCount !== 0 ||
        result.pendingFrontendBlockCount !== 0
      ) {
        return yield* new ZerospinError({
          code: 'frontend-generation-drain-postcondition-failed',
          message: 'FrontendRepo reported pending work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const serviceRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceRepo',
    });
    for (const registration of serviceRepos) {
      const key = yield* ServiceRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceRepo = yield* getServiceRepo({ key });
      const encoded = yield* makeAsync(() => serviceRepo.drainGeneration());
      const result = yield* decodeRpc(encoded);
      if (result.pendingServiceBlockCount !== 0) {
        return yield* new ZerospinError({
          code: 'service-generation-drain-postcondition-failed',
          message: 'ServiceRepo reported pending work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const serviceBlockReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceBlockRepo',
    });
    for (const registration of serviceBlockReposToDrain) {
      const key = yield* ServiceBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceBlockRepo = yield* getServiceBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        serviceBlockRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (
        result.pendingAccountSubscriberCount !== 0 ||
        result.pendingServiceFrontendSubscriberCount !== 0
      ) {
        return yield* new ZerospinError({
          code: 'service-block-generation-drain-postcondition-failed',
          message:
            'ServiceBlockRepo reported pending subscribers after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const serviceFrontendReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceFrontendRepo',
    });
    for (const registration of serviceFrontendReposToDrain) {
      const key = yield* ServiceFrontendRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceFrontendRepo = yield* getServiceFrontendRepo({ key });
      const encodedUnknown = yield* makeAsync(() =>
        serviceFrontendRepo.drainGeneration(),
      );
      const encoded = yield* Schema.decodeUnknown(
        Schema.Union(
          Schema.Struct({
            _tag: Schema.Literal('Right'),
            right: Schema.Struct({
              pendingServiceFrontendBlockCount: Schema.Number,
            }),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Left'),
            left: Schema.encodedSchema(ZerospinError.schema),
          }),
        ),
      )(encodedUnknown).pipe(
        mapParseError({
          code: 'service-frontend-generation-drain-rpc-invalid',
          prefix: 'Failed to decode ServiceFrontendRepo drain RPC',
          extra: { repoName: registration.repoName },
        }),
      );
      const result = yield* decodeRpc(encoded);
      if (result.pendingServiceFrontendBlockCount !== 0) {
        return yield* new ZerospinError({
          code: 'service-frontend-generation-drain-postcondition-failed',
          message:
            'ServiceFrontendRepo reported pending archive work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const accountRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'AccountRepo',
    });
    for (const registration of accountRepos) {
      const key = yield* AccountRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const accountRepo = yield* getAccountRepo({ key });
      const encoded = yield* makeAsync(() => accountRepo.drainGeneration());
      const result = yield* decodeRpc(encoded);
      if (
        result.pendingServiceSubscriptionCount !== 0 ||
        result.pendingAccountBlockCount !== 0
      ) {
        return yield* new ZerospinError({
          code: 'account-generation-drain-postcondition-failed',
          message: 'AccountRepo reported pending work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const accountBlockReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'AccountBlockRepo',
    });
    for (const registration of accountBlockReposToDrain) {
      const key = yield* AccountBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const accountBlockRepo = yield* getAccountBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        accountBlockRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (result.pendingActorSubscriberCount !== 0) {
        return yield* new ZerospinError({
          code: 'account-block-generation-drain-postcondition-failed',
          message:
            'AccountBlockRepo reported pending subscribers after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    // AccountBlockRepo acknowledges ActorRepo only after the actor transaction
    // commits. ActorRepo's subsequent ActorBlockRepo publish is separately
    // durable, so replay every retained actor outbox before asking the actor
    // block archives to finish their frontend deliveries.
    const actorReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ActorRepo',
    });
    for (const registration of actorReposToDrain) {
      const key = yield* ActorRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const actorRepo = yield* getActorRepo({ key });
      const encoded = yield* makeAsync(() => actorRepo.drainGeneration());
      const result = yield* decodeRpc(encoded);
      if (result.pendingActorBlockCount !== 0) {
        return yield* new ZerospinError({
          code: 'actor-generation-drain-postcondition-failed',
          message:
            'ActorRepo reported pending actor blocks after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    // ActorBlockRepo intentionally acknowledges storage before its ordinary
    // waitUntil frontend fanout settles. Freeze must call that existing drain
    // boundary directly so no admitted actor block remains outside the finite
    // projection segment.
    const actorBlockReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ActorBlockRepo',
    });
    for (const registration of actorBlockReposToDrain) {
      const key = yield* ActorBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const actorBlockRepo = yield* getActorBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        actorBlockRepo.drainFrontendSubscribers({ forceRetryNow: true }),
      );
      const result = yield* decodeRpc(encoded);
      if (result.pendingFrontendSubscriberCount !== 0) {
        return yield* new ZerospinError({
          code: 'actor-block-generation-drain-postcondition-failed',
          message:
            'ActorBlockRepo reported pending frontend subscribers after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    // Each FrontendRepo delivery above commits its local projection before its
    // archive outbox finishes in waitUntil. Re-drain the complete registration
    // set now; only this final pass establishes the readiness/archive equality
    // that the immutable bounds below record.
    const frozenFrontendReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'FrontendRepo',
    });
    for (const registration of frozenFrontendReposToDrain) {
      const key = yield* FrontendRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const frontendRepo = yield* getFrontendRepo({ key });
      const encoded = yield* makeAsync(() => frontendRepo.drainGeneration());
      const result = yield* decodeRpc(encoded);
      if (
        result.pendingPushedBlockCount !== 0 ||
        result.pendingFrontendBlockCount !== 0
      ) {
        return yield* new ZerospinError({
          code: 'frontend-generation-final-drain-postcondition-failed',
          message:
            'FrontendRepo reported pending work after final generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    // Checkpoint 3: re-read block registrations after downstream drain because
    // accepted work may have created a block repo that was absent at step start.
    const serviceBlockRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceBlockRepo',
    });
    for (const registration of serviceBlockRepos) {
      const key = yield* ServiceBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceBlockRepo = yield* getServiceBlockRepo({ key });
      const encoded = yield* makeAsync(() => serviceBlockRepo.getReplayBound());
      const bound = yield* decodeRpc(encoded);
      if (
        (bound.lastServiceCursor === null) !==
        (bound.serviceIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'service-replay-bound-inconsistent',
          message:
            'Service replay cursor and index must both be null or present',
          extra: { repoName: registration.repoName, ...bound },
        });
      }
      const stored = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(
              and(
                eq(drainBoundsColumns.deployId, deployId),
                eq(drainBoundsColumns.repoName, registration.repoName),
              ),
            )
            .get(),
        catch: ZerospinError.catch({
          code: 'service-replay-bound-read-failed',
          message: 'Failed to read stored service replay bound',
          extra: { deployId, generationId, repoName: registration.repoName },
        }),
      });
      if (stored === undefined) {
        yield* Effect.try({
          try: () =>
            db
              .insert(drainBoundsTable)
              .values({
                deployId,
                repoType: 'ServiceBlockRepo',
                repoName: registration.repoName,
                terminalCursor: bound.lastServiceCursor,
                terminalIndex: bound.serviceIndex,
                capturedAt: new Date(),
              })
              .onConflictDoNothing()
              .run(),
          catch: ZerospinError.catch({
            code: 'service-replay-bound-write-failed',
            message: 'Failed to store service replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        });
      } else {
        const decodedStored = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal('ServiceBlockRepo', 'AccountBlockRepo'),
            terminalCursor: Schema.NullOr(Schema.String),
            terminalIndex: Schema.NullOr(Schema.Number),
          }),
        )(stored).pipe(
          mapParseError({
            code: 'stored-service-replay-bound-invalid',
            prefix: 'Stored service replay bound is invalid',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        );
        if (
          decodedStored.repoType !== 'ServiceBlockRepo' ||
          decodedStored.terminalCursor !== bound.lastServiceCursor ||
          decodedStored.terminalIndex !== bound.serviceIndex
        ) {
          return yield* new ZerospinError({
            code: 'service-replay-bound-conflict',
            message: 'A drain retry observed a different service replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          });
        }
      }
    }

    const accountBlockRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'AccountBlockRepo',
    });
    for (const registration of accountBlockRepos) {
      const key = yield* AccountBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const accountBlockRepo = yield* getAccountBlockRepo({ key });
      const encoded = yield* makeAsync(() => accountBlockRepo.getReplayBound());
      const bound = yield* decodeRpc(encoded);
      if (
        (bound.lastAccountCursor === null) !==
        (bound.accountIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'account-replay-bound-inconsistent',
          message:
            'Account replay cursor and index must both be null or present',
          extra: { repoName: registration.repoName, ...bound },
        });
      }
      const stored = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(
              and(
                eq(drainBoundsColumns.deployId, deployId),
                eq(drainBoundsColumns.repoName, registration.repoName),
              ),
            )
            .get(),
        catch: ZerospinError.catch({
          code: 'account-replay-bound-read-failed',
          message: 'Failed to read stored account replay bound',
          extra: { deployId, generationId, repoName: registration.repoName },
        }),
      });
      if (stored === undefined) {
        yield* Effect.try({
          try: () =>
            db
              .insert(drainBoundsTable)
              .values({
                deployId,
                repoType: 'AccountBlockRepo',
                repoName: registration.repoName,
                terminalCursor: bound.lastAccountCursor,
                terminalIndex: bound.accountIndex,
                capturedAt: new Date(),
              })
              .onConflictDoNothing()
              .run(),
          catch: ZerospinError.catch({
            code: 'account-replay-bound-write-failed',
            message: 'Failed to store account replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        });
      } else {
        const decodedStored = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal('ServiceBlockRepo', 'AccountBlockRepo'),
            terminalCursor: Schema.NullOr(Schema.String),
            terminalIndex: Schema.NullOr(Schema.Number),
          }),
        )(stored).pipe(
          mapParseError({
            code: 'stored-account-replay-bound-invalid',
            prefix: 'Stored account replay bound is invalid',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        );
        if (
          decodedStored.repoType !== 'AccountBlockRepo' ||
          decodedStored.terminalCursor !== bound.lastAccountCursor ||
          decodedStored.terminalIndex !== bound.accountIndex
        ) {
          return yield* new ZerospinError({
            code: 'account-replay-bound-conflict',
            message: 'A drain retry observed a different account replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          });
        }
      }
    }

    // Every account projection admitted before the freeze contributes one
    // immutable causal watermark plus its physical archive descriptor.
    const frozenFrontendRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'FrontendRepo',
    });
    for (const registration of frozenFrontendRepos) {
      const key = yield* FrontendRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const frontendRepo = yield* getFrontendRepo({ key });
      const readinessEncoded = yield* makeAsync(() =>
        frontendRepo.getProjectionReadiness(),
      );
      const readiness = yield* decodeRpc(readinessEncoded);
      if (
        readiness.generationId !== generationId ||
        (readiness.lastAccountCursor === null) !==
          (readiness.accountIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'frontend-generation-drain-readiness-invalid',
          message:
            'FrontendRepo readiness does not match the frozen generation and causal watermark',
          extra: { repoName: registration.repoName, ...readiness },
        });
      }

      const frontendBlockRepoName =
        yield* FrontendBlockRepo.repoUtils.nameUtils.makeName(key);
      const frontendBlockRepo = yield* getFrontendBlockRepo({ key });
      const descriptorUnknown = yield* makeAsync(() =>
        frontendBlockRepo.getPredecessor(),
      );
      const descriptorEncoded = yield* Schema.decodeUnknown(
        Schema.Union(
          Schema.Struct({
            _tag: Schema.Literal('Right'),
            right: Schema.Struct({
              systemId: Schema.String,
              generationId: Schema.String,
              terminalFrontendIndex: Schema.Number,
              predecessor: Schema.NullOr(
                Schema.Struct({
                  generationId: Schema.String,
                  repoName: Schema.String,
                  terminalFrontendIndex: Schema.Number,
                }),
              ),
            }),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Left'),
            left: Schema.encodedSchema(ZerospinError.schema),
          }),
        ),
      )(descriptorUnknown).pipe(
        mapParseError({
          code: 'frontend-generation-drain-descriptor-rpc-invalid',
          prefix: 'Failed to decode FrontendBlockRepo descriptor RPC',
          extra: { repoName: registration.repoName },
        }),
      );
      const descriptor = yield* decodeRpc(descriptorEncoded);
      if (
        descriptor.generationId !== generationId ||
        descriptor.terminalFrontendIndex !== readiness.frontendIndex
      ) {
        return yield* new ZerospinError({
          code: 'frontend-generation-drain-archive-mismatch',
          message:
            'FrontendRepo readiness is not exactly covered by its immutable archive',
          extra: {
            repoName: registration.repoName,
            frontendBlockRepoName,
            readinessFrontendIndex: readiness.frontendIndex,
            archiveFrontendIndex: descriptor.terminalFrontendIndex,
          },
        });
      }

      const stored = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(
              and(
                eq(drainBoundsColumns.deployId, deployId),
                eq(drainBoundsColumns.repoName, registration.repoName),
              ),
            )
            .get(),
        catch: ZerospinError.catch({
          code: 'frontend-generation-drain-bound-read-failed',
          message: 'Failed to read stored FrontendRepo drain bound',
          extra: { deployId, generationId, repoName: registration.repoName },
        }),
      });
      const segmentKind =
        descriptor.predecessor === null ? 'root' : 'inherited';
      if (stored === undefined) {
        yield* Effect.try({
          try: () =>
            db
              .insert(drainBoundsTable)
              .values({
                deployId,
                repoType: 'FrontendRepo',
                repoName: registration.repoName,
                terminalCursor: readiness.lastAccountCursor,
                terminalIndex: readiness.accountIndex,
                systemWorkerName: readiness.systemWorkerName,
                frontendBlockRepoName,
                terminalFrontendIndex: readiness.frontendIndex,
                segmentKind,
                predecessorGenerationId:
                  descriptor.predecessor?.generationId ?? null,
                predecessorRepoName: descriptor.predecessor?.repoName ?? null,
                predecessorTerminalFrontendIndex:
                  descriptor.predecessor?.terminalFrontendIndex ?? null,
                capturedAt: new Date(),
              })
              .onConflictDoNothing()
              .run(),
          catch: ZerospinError.catch({
            code: 'frontend-generation-drain-bound-write-failed',
            message: 'Failed to store FrontendRepo drain bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        });
      } else {
        const decodedStored = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal(
              'ServiceBlockRepo',
              'AccountBlockRepo',
              'FrontendRepo',
              'ServiceFrontendRepo',
            ),
            terminalCursor: Schema.NullOr(Schema.String),
            terminalIndex: Schema.NullOr(Schema.Number),
            systemWorkerName: Schema.NullOr(Schema.String),
            frontendBlockRepoName: Schema.NullOr(Schema.String),
            terminalFrontendIndex: Schema.NullOr(Schema.Number),
            segmentKind: Schema.NullOr(
              Schema.Literal('root', 'inherited', 'no-local-segment'),
            ),
            predecessorGenerationId: Schema.NullOr(Schema.String),
            predecessorRepoName: Schema.NullOr(Schema.String),
            predecessorTerminalFrontendIndex: Schema.NullOr(Schema.Number),
          }),
        )(stored).pipe(
          mapParseError({
            code: 'stored-frontend-generation-drain-bound-invalid',
            prefix: 'Stored FrontendRepo drain bound is invalid',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        );
        const incompleteReservation =
          decodedStored.terminalCursor === null &&
          decodedStored.terminalIndex === null &&
          decodedStored.systemWorkerName === null &&
          decodedStored.frontendBlockRepoName === null &&
          decodedStored.terminalFrontendIndex === null;
        if (
          incompleteReservation &&
          decodedStored.repoType === 'FrontendRepo' &&
          decodedStored.segmentKind === segmentKind &&
          decodedStored.predecessorGenerationId ===
            (descriptor.predecessor?.generationId ?? null) &&
          decodedStored.predecessorRepoName ===
            (descriptor.predecessor?.repoName ?? null) &&
          decodedStored.predecessorTerminalFrontendIndex ===
            (descriptor.predecessor?.terminalFrontendIndex ?? null)
        ) {
          yield* Effect.try({
            try: () =>
              db
                .update(drainBoundsTable)
                .set({
                  terminalCursor: readiness.lastAccountCursor,
                  terminalIndex: readiness.accountIndex,
                  systemWorkerName: readiness.systemWorkerName,
                  frontendBlockRepoName,
                  terminalFrontendIndex: readiness.frontendIndex,
                  capturedAt: new Date(),
                })
                .where(
                  and(
                    eq(drainBoundsColumns.deployId, deployId),
                    eq(drainBoundsColumns.repoName, registration.repoName),
                  ),
                )
                .run(),
            catch: ZerospinError.catch({
              code: 'frontend-generation-drain-bound-write-failed',
              message:
                'Failed to complete the admitted FrontendRepo drain reservation',
              extra: {
                deployId,
                generationId,
                repoName: registration.repoName,
              },
            }),
          });
        } else if (
          decodedStored.repoType !== 'FrontendRepo' ||
          decodedStored.terminalCursor !== readiness.lastAccountCursor ||
          decodedStored.terminalIndex !== readiness.accountIndex ||
          decodedStored.systemWorkerName !== readiness.systemWorkerName ||
          decodedStored.frontendBlockRepoName !== frontendBlockRepoName ||
          decodedStored.terminalFrontendIndex !== readiness.frontendIndex ||
          decodedStored.segmentKind !== segmentKind ||
          decodedStored.predecessorGenerationId !==
            (descriptor.predecessor?.generationId ?? null) ||
          decodedStored.predecessorRepoName !==
            (descriptor.predecessor?.repoName ?? null) ||
          decodedStored.predecessorTerminalFrontendIndex !==
            (descriptor.predecessor?.terminalFrontendIndex ?? null)
        ) {
          return yield* new ZerospinError({
            code: 'frontend-generation-drain-bound-conflict',
            message:
              'A drain retry observed a different FrontendRepo projection bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          });
        }
      }
    }

    // Service-owned projections have the same finite lineage receipt, with a
    // service cursor/index pair instead of an account cursor/index pair.
    const frozenServiceFrontendRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceFrontendRepo',
    });
    for (const registration of frozenServiceFrontendRepos) {
      const key = yield* ServiceFrontendRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceFrontendRepo = yield* getServiceFrontendRepo({ key });
      const readinessUnknown = yield* makeAsync(() =>
        serviceFrontendRepo.getProjectionReadiness(),
      );
      const readinessEncoded = yield* Schema.decodeUnknown(
        Schema.Union(
          Schema.Struct({
            _tag: Schema.Literal('Right'),
            right: Schema.Struct({
              generationId: Schema.String,
              systemWorkerName: Schema.String,
              lastServiceCursor: Schema.NullOr(Schema.String),
              serviceIndex: Schema.NullOr(Schema.Number),
              frontendIndex: Schema.Number,
              segmentKind: Schema.Literal(
                'root',
                'inherited',
                'no-local-segment',
              ),
              predecessorGenerationId: Schema.NullOr(Schema.String),
              predecessorRepoName: Schema.NullOr(Schema.String),
              predecessorTerminalFrontendIndex: Schema.NullOr(Schema.Number),
            }),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Left'),
            left: Schema.encodedSchema(ZerospinError.schema),
          }),
        ),
      )(readinessUnknown).pipe(
        mapParseError({
          code: 'service-frontend-generation-drain-readiness-rpc-invalid',
          prefix: 'Failed to decode ServiceFrontendRepo readiness RPC',
          extra: { repoName: registration.repoName },
        }),
      );
      const readiness = yield* decodeRpc(readinessEncoded);
      if (
        readiness.generationId !== generationId ||
        (readiness.lastServiceCursor === null) !==
          (readiness.serviceIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-generation-drain-readiness-invalid',
          message:
            'ServiceFrontendRepo readiness does not match the frozen generation and causal watermark',
          extra: { repoName: registration.repoName, ...readiness },
        });
      }

      const serviceFrontendBlockRepoName =
        yield* ServiceFrontendBlockRepo.repoUtils.nameUtils.makeName(key);
      const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({
        key,
      });
      const descriptorUnknown = yield* makeAsync(() =>
        serviceFrontendBlockRepo.getPredecessor(),
      );
      const descriptorEncoded = yield* Schema.decodeUnknown(
        Schema.Union(
          Schema.Struct({
            _tag: Schema.Literal('Right'),
            right: Schema.Struct({
              systemId: Schema.String,
              generationId: Schema.String,
              serviceName: Schema.String,
              actorName: Schema.String,
              actorId: Schema.String,
              frontendName: Schema.String,
              terminalFrontendIndex: Schema.Number,
              predecessor: Schema.NullOr(
                Schema.Struct({
                  generationId: Schema.String,
                  repoName: Schema.String,
                  terminalFrontendIndex: Schema.Number,
                }),
              ),
            }),
          }),
          Schema.Struct({
            _tag: Schema.Literal('Left'),
            left: Schema.encodedSchema(ZerospinError.schema),
          }),
        ),
      )(descriptorUnknown).pipe(
        mapParseError({
          code: 'service-frontend-generation-drain-descriptor-rpc-invalid',
          prefix: 'Failed to decode ServiceFrontendBlockRepo descriptor RPC',
          extra: { repoName: registration.repoName },
        }),
      );
      const descriptor = yield* decodeRpc(descriptorEncoded);
      const expectedPredecessorGenerationId =
        descriptor.predecessor?.generationId ?? null;
      const expectedPredecessorRepoName =
        descriptor.predecessor?.repoName ?? null;
      const expectedPredecessorTerminalFrontendIndex =
        descriptor.predecessor?.terminalFrontendIndex ?? null;
      if (
        descriptor.generationId !== generationId ||
        descriptor.serviceName !== key.serviceName ||
        descriptor.actorName !== key.actorName ||
        descriptor.actorId !== key.actorId ||
        descriptor.frontendName !== key.frontendName ||
        descriptor.terminalFrontendIndex !== readiness.frontendIndex ||
        readiness.predecessorGenerationId !== expectedPredecessorGenerationId ||
        readiness.predecessorRepoName !== expectedPredecessorRepoName ||
        readiness.predecessorTerminalFrontendIndex !==
          expectedPredecessorTerminalFrontendIndex ||
        (readiness.segmentKind === 'root' && descriptor.predecessor !== null) ||
        (readiness.segmentKind === 'inherited' &&
          descriptor.predecessor === null) ||
        readiness.segmentKind === 'no-local-segment'
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-generation-drain-archive-mismatch',
          message:
            'ServiceFrontendRepo readiness is not exactly covered by its immutable archive descriptor',
          extra: {
            repoName: registration.repoName,
            serviceFrontendBlockRepoName,
            readinessFrontendIndex: readiness.frontendIndex,
            archiveFrontendIndex: descriptor.terminalFrontendIndex,
          },
        });
      }

      const stored = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(
              and(
                eq(drainBoundsColumns.deployId, deployId),
                eq(drainBoundsColumns.repoName, registration.repoName),
              ),
            )
            .get(),
        catch: ZerospinError.catch({
          code: 'service-frontend-generation-drain-bound-read-failed',
          message: 'Failed to read stored ServiceFrontendRepo drain bound',
          extra: { deployId, generationId, repoName: registration.repoName },
        }),
      });
      if (stored === undefined) {
        yield* Effect.try({
          try: () =>
            db
              .insert(drainBoundsTable)
              .values({
                deployId,
                repoType: 'ServiceFrontendRepo',
                repoName: registration.repoName,
                terminalCursor: readiness.lastServiceCursor,
                terminalIndex: readiness.serviceIndex,
                systemWorkerName: readiness.systemWorkerName,
                frontendBlockRepoName: serviceFrontendBlockRepoName,
                terminalFrontendIndex: readiness.frontendIndex,
                segmentKind: readiness.segmentKind,
                predecessorGenerationId: readiness.predecessorGenerationId,
                predecessorRepoName: readiness.predecessorRepoName,
                predecessorTerminalFrontendIndex:
                  readiness.predecessorTerminalFrontendIndex,
                capturedAt: new Date(),
              })
              .onConflictDoNothing()
              .run(),
          catch: ZerospinError.catch({
            code: 'service-frontend-generation-drain-bound-write-failed',
            message: 'Failed to store ServiceFrontendRepo drain bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        });
      } else {
        const decodedStored = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal(
              'ServiceBlockRepo',
              'AccountBlockRepo',
              'FrontendRepo',
              'ServiceFrontendRepo',
            ),
            terminalCursor: Schema.NullOr(Schema.String),
            terminalIndex: Schema.NullOr(Schema.Number),
            systemWorkerName: Schema.NullOr(Schema.String),
            frontendBlockRepoName: Schema.NullOr(Schema.String),
            terminalFrontendIndex: Schema.NullOr(Schema.Number),
            segmentKind: Schema.NullOr(
              Schema.Literal('root', 'inherited', 'no-local-segment'),
            ),
            predecessorGenerationId: Schema.NullOr(Schema.String),
            predecessorRepoName: Schema.NullOr(Schema.String),
            predecessorTerminalFrontendIndex: Schema.NullOr(Schema.Number),
          }),
        )(stored).pipe(
          mapParseError({
            code: 'stored-service-frontend-generation-drain-bound-invalid',
            prefix: 'Stored ServiceFrontendRepo drain bound is invalid',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        );
        const incompleteReservation =
          decodedStored.terminalCursor === null &&
          decodedStored.terminalIndex === null &&
          decodedStored.systemWorkerName === null &&
          decodedStored.frontendBlockRepoName === null &&
          decodedStored.terminalFrontendIndex === null;
        if (
          incompleteReservation &&
          decodedStored.repoType === 'ServiceFrontendRepo' &&
          decodedStored.segmentKind === readiness.segmentKind &&
          decodedStored.predecessorGenerationId ===
            readiness.predecessorGenerationId &&
          decodedStored.predecessorRepoName === readiness.predecessorRepoName &&
          decodedStored.predecessorTerminalFrontendIndex ===
            readiness.predecessorTerminalFrontendIndex
        ) {
          yield* Effect.try({
            try: () =>
              db
                .update(drainBoundsTable)
                .set({
                  terminalCursor: readiness.lastServiceCursor,
                  terminalIndex: readiness.serviceIndex,
                  systemWorkerName: readiness.systemWorkerName,
                  frontendBlockRepoName: serviceFrontendBlockRepoName,
                  terminalFrontendIndex: readiness.frontendIndex,
                  capturedAt: new Date(),
                })
                .where(
                  and(
                    eq(drainBoundsColumns.deployId, deployId),
                    eq(drainBoundsColumns.repoName, registration.repoName),
                  ),
                )
                .run(),
            catch: ZerospinError.catch({
              code: 'service-frontend-generation-drain-bound-write-failed',
              message:
                'Failed to complete the admitted ServiceFrontendRepo drain reservation',
              extra: {
                deployId,
                generationId,
                repoName: registration.repoName,
              },
            }),
          });
        } else if (
          decodedStored.repoType !== 'ServiceFrontendRepo' ||
          decodedStored.terminalCursor !== readiness.lastServiceCursor ||
          decodedStored.terminalIndex !== readiness.serviceIndex ||
          decodedStored.systemWorkerName !== readiness.systemWorkerName ||
          decodedStored.frontendBlockRepoName !==
            serviceFrontendBlockRepoName ||
          decodedStored.terminalFrontendIndex !== readiness.frontendIndex ||
          decodedStored.segmentKind !== readiness.segmentKind ||
          decodedStored.predecessorGenerationId !==
            readiness.predecessorGenerationId ||
          decodedStored.predecessorRepoName !== readiness.predecessorRepoName ||
          decodedStored.predecessorTerminalFrontendIndex !==
            readiness.predecessorTerminalFrontendIndex
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-generation-drain-bound-conflict',
            message:
              'A drain retry observed a different ServiceFrontendRepo projection bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          });
        }
      }
    }

    // Checkpoint 4: the final reservation/count check and freeze marker write
    // are one synchronous transaction. A live lineage resolution that lands
    // after the scans above inserts its reservation before this transaction or
    // observes the committed freeze afterward; it cannot escape both sides.
    const expectedBoundCount =
      serviceBlockRepos.length +
      accountBlockRepos.length +
      frozenFrontendRepos.length +
      frozenServiceFrontendRepos.length;
    const freezeDecision = yield* makeTx({
      db,
      program: Effect.fn('SystemRepo.drainGeneration.freeze.transaction')(
        function* ({ tx }) {
          yield* Effect.void;
          const remainingWriteReservations = tx
            .select({
              reservationId: generationWriteReservationColumns.reservationId,
            })
            .from(generationWriteReservationTable)
            .all();
          if (remainingWriteReservations.length !== 0) {
            return {
              frozen: false,
              incompleteReservationRepoName: null,
              storedBoundCount: 0,
              remainingWriteReservationCount: remainingWriteReservations.length,
            };
          }

          const storedBounds = tx
            .select({
              repoName: drainBoundsColumns.repoName,
              repoType: drainBoundsColumns.repoType,
              systemWorkerName: drainBoundsColumns.systemWorkerName,
              frontendBlockRepoName: drainBoundsColumns.frontendBlockRepoName,
              terminalFrontendIndex: drainBoundsColumns.terminalFrontendIndex,
            })
            .from(drainBoundsTable)
            .where(eq(drainBoundsColumns.deployId, deployId))
            .orderBy(asc(drainBoundsColumns.repoName))
            .all();
          const incompleteReservation = storedBounds.find(
            bound =>
              (bound.repoType === 'FrontendRepo' ||
                bound.repoType === 'ServiceFrontendRepo') &&
              (bound.systemWorkerName === null ||
                bound.frontendBlockRepoName === null ||
                bound.terminalFrontendIndex === null),
          );
          if (
            incompleteReservation !== undefined ||
            storedBounds.length !== expectedBoundCount
          ) {
            return {
              frozen: false,
              incompleteReservationRepoName:
                incompleteReservation?.repoName ?? null,
              storedBoundCount: storedBounds.length,
              remainingWriteReservationCount: 0,
            };
          }

          tx.update(generationStateTable)
            .set({ drainFrozenAt: new Date() })
            .where(
              and(
                eq(generationStateColumns.generationId, generationId),
                eq(generationStateColumns.activeDeployId, deployId),
                eq(generationStateColumns.admission, 'draining'),
                isNull(generationStateColumns.drainFrozenAt),
              ),
            )
            .run();
          return {
            frozen: true,
            incompleteReservationRepoName: null,
            storedBoundCount: storedBounds.length,
            remainingWriteReservationCount: 0,
          };
        },
      ),
    });
    if (freezeDecision.remainingWriteReservationCount !== 0) {
      return yield* new ZerospinError({
        code: 'generation-write-reservations-not-drained',
        message:
          'An admitted generation write appeared during final freeze verification',
        extra: {
          deployId,
          generationId,
          remainingWriteReservationCount:
            freezeDecision.remainingWriteReservationCount,
        },
      });
    }
    if (!freezeDecision.frozen) {
      return yield* new ZerospinError({
        code: 'generation-replay-bounds-incomplete',
        message:
          'Not every admitted and registered repo has a complete captured replay bound',
        extra: {
          deployId,
          generationId,
          expectedBoundCount,
          incompleteReservationRepoName:
            freezeDecision.incompleteReservationRepoName,
          storedBoundCount: freezeDecision.storedBoundCount,
        },
      });
    }

    const rawFrozenState = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-drain-freeze-verification-read-failed',
        message: 'Failed to verify frozen generation drain bounds',
        extra: { deployId, generationId },
      }),
    });
    const frozenState = yield* Schema.decodeUnknown(
      Schema.Struct({
        activeDeployId: Schema.NullOr(Schema.String),
        admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
        drainFrozenAt: Schema.NullOr(Schema.DateFromSelf),
      }),
    )(rawFrozenState).pipe(
      mapParseError({
        code: 'generation-drain-freeze-verification-invalid',
        prefix: 'Stored frozen generation drain state is invalid',
        extra: { deployId, generationId },
      }),
    );
    if (
      frozenState.activeDeployId !== deployId ||
      frozenState.admission !== 'draining' ||
      frozenState.drainFrozenAt === null
    ) {
      return yield* new ZerospinError({
        code: 'generation-drain-freeze-write-conflict',
        message: 'Generation drain state changed while bounds were freezing',
        extra: {
          deployId,
          generationId,
          activeDeployId: frozenState.activeDeployId,
          admission: frozenState.admission,
          drainFrozenAt: frozenState.drainFrozenAt,
        },
      });
    }

    return { deployId, generationId, admission: 'draining' };
  },
);
