/*
 * Resolves one logical frontend's nearest real archived ancestor without
 * creating a projection, subscriber, or block repository.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type {
  IAccountId,
  IActorId,
  IAnyDrizzleSchema,
} from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { FrontendRepo } from '../../FrontendRepo/FrontendRepo.js';
import { ServiceFrontendRepo } from '../../ServiceFrontendRepo/ServiceFrontendRepo.js';
import { SystemRepo } from '../SystemRepo.js';

export const resolveFrontendProjectionLineage = Effect.fn(
  'SystemRepo.resolveFrontendProjectionLineage',
)(function* (props: {
  db: IDb;
  deployId: string;
  generationId: string;
  target:
    | Readonly<{
        kind: 'account';
        accountId: IAccountId;
        accountName: string;
        actorId: IActorId;
        actorName: string;
        frontendName: string;
      }>
    | Readonly<{
        kind: 'service';
        serviceName: string;
        actorName: string;
        actorId: IActorId;
        frontendName: string;
      }>;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
  drainBoundsTable: IAnyDrizzleSchema;
  drainBoundsColumns: Readonly<{
    deployId: AnyColumn;
    repoName: AnyColumn;
  }>;
}): Effect.fn.Return<
  Readonly<{
    mode: 'live' | 'no-local-segment';
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }> | null;
  }>,
  IAnyError,
  Async
> {
  const {
    db,
    deployId,
    drainBoundsColumns,
    drainBoundsTable,
    generationId,
    generationStateColumns,
    generationStateTable,
    target,
  } = props;

  // 1. Read admission and freeze classification come from the same
  // generation-local lifecycle row used by every other SystemRepo gate.
  const rawGenerationState = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(generationStateTable)
        .where(eq(generationStateColumns.generationId, generationId))
        .get(),
    catch: ZerospinError.catch({
      code: 'frontend-lineage-generation-state-read-failed',
      message:
        'Failed to read generation state while resolving frontend lineage',
      extra: { deployId, generationId, kind: target.kind },
    }),
  });
  if (rawGenerationState === undefined) {
    return yield* new ZerospinError({
      code: 'frontend-lineage-generation-state-required',
      message:
        'Frontend lineage cannot be resolved before generation preparation',
      extra: { deployId, generationId, kind: target.kind },
    });
  }
  const generationState = yield* Schema.decodeUnknown(
    Schema.Struct({
      generationId: Schema.String,
      prevGenerationId: Schema.NullOr(Schema.String),
      activeDeployId: Schema.NullOr(Schema.String),
      readiness: Schema.Literal('initializing', 'ready', 'failed'),
      admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
      drainFrozenAt: Schema.NullOr(Schema.DateFromSelf),
    }),
  )(rawGenerationState).pipe(
    mapParseError({
      code: 'frontend-lineage-generation-state-invalid',
      prefix:
        'Stored generation state is invalid while resolving frontend lineage',
      extra: { deployId, generationId, kind: target.kind },
    }),
  );
  if (
    generationState.generationId !== generationId ||
    generationState.readiness !== 'ready' ||
    generationState.activeDeployId !== deployId ||
    (generationState.admission !== 'open' &&
      generationState.admission !== 'draining')
  ) {
    return yield* new ZerospinError({
      code: 'frontend-lineage-read-admission-closed',
      message:
        'Frontend lineage requires the exact ready, read-admitted generation deploy',
      extra: {
        deployId,
        generationId,
        storedGenerationId: generationState.generationId,
        activeDeployId: generationState.activeDeployId,
        readiness: generationState.readiness,
        admission: generationState.admission,
      },
    });
  }

  const currentRepoName =
    target.kind === 'account'
      ? yield* FrontendRepo.repoUtils.nameUtils.makeName({
          generationId,
          accountId: target.accountId,
          accountName: target.accountName,
          actorId: target.actorId,
          actorName: target.actorName,
          frontendName: target.frontendName,
        })
      : yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName({
          generationId,
          serviceName: target.serviceName,
          actorName: target.actorName,
          actorId: target.actorId,
          frontendName: target.frontendName,
        });
  const currentRepoType =
    target.kind === 'account' ? 'FrontendRepo' : 'ServiceFrontendRepo';

  // 2. Once freeze has captured a real current segment, every retry returns
  // its persisted classification and predecessor instead of reclassifying it
  // as a later no-local projection.
  const rawCurrentBound = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(drainBoundsTable)
        .where(
          and(
            eq(drainBoundsColumns.deployId, deployId),
            eq(drainBoundsColumns.repoName, currentRepoName),
          ),
        )
        .get(),
    catch: ZerospinError.catch({
      code: 'frontend-lineage-current-bound-read-failed',
      message:
        'Failed to read the current projection bound while resolving lineage',
      extra: { deployId, generationId, repoName: currentRepoName },
    }),
  });
  if (rawCurrentBound !== undefined) {
    const currentBound = yield* Schema.decodeUnknown(
      Schema.Struct({
        repoType: Schema.Literal('FrontendRepo', 'ServiceFrontendRepo'),
        systemWorkerName: Schema.NullOr(Schema.String),
        frontendBlockRepoName: Schema.NullOr(Schema.String),
        terminalFrontendIndex: Schema.NullOr(Schema.Number),
        segmentKind: Schema.Literal('root', 'inherited', 'no-local-segment'),
        predecessorGenerationId: Schema.NullOr(Schema.String),
        predecessorRepoName: Schema.NullOr(Schema.String),
        predecessorTerminalFrontendIndex: Schema.NullOr(Schema.Number),
      }),
    )(rawCurrentBound).pipe(
      mapParseError({
        code: 'frontend-lineage-current-bound-invalid',
        prefix:
          'Stored current projection bound is invalid while resolving lineage',
        extra: { deployId, generationId, repoName: currentRepoName },
      }),
    );
    if (currentBound.repoType !== currentRepoType) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-current-bound-kind-mismatch',
        message:
          'Stored current projection bound belongs to another frontend kind',
        extra: {
          deployId,
          generationId,
          repoName: currentRepoName,
          expectedRepoType: currentRepoType,
          storedRepoType: currentBound.repoType,
        },
      });
    }
    if (
      (currentBound.predecessorGenerationId === null &&
        (currentBound.predecessorRepoName !== null ||
          currentBound.predecessorTerminalFrontendIndex !== null)) ||
      (currentBound.predecessorGenerationId !== null &&
        (currentBound.predecessorRepoName === null ||
          currentBound.predecessorTerminalFrontendIndex === null))
    ) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-current-predecessor-incomplete',
        message:
          'Stored current projection predecessor descriptor is incomplete',
        extra: { deployId, generationId, repoName: currentRepoName },
      });
    }
    const incompleteReservation =
      currentBound.systemWorkerName === null &&
      currentBound.frontendBlockRepoName === null &&
      currentBound.terminalFrontendIndex === null;
    const completeBound =
      currentBound.systemWorkerName !== null &&
      currentBound.frontendBlockRepoName !== null &&
      currentBound.terminalFrontendIndex !== null;
    if (
      (!incompleteReservation && !completeBound) ||
      (incompleteReservation && currentBound.segmentKind === 'no-local-segment')
    ) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-current-bound-incomplete',
        message:
          'Stored current frontend projection bound is neither an admission reservation nor a complete frozen bound',
        extra: { deployId, generationId, repoName: currentRepoName },
      });
    }
    if (incompleteReservation && generationState.drainFrozenAt !== null) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-frozen-reservation-incomplete',
        message:
          'Frozen generation contains an incomplete frontend projection admission reservation',
        extra: { deployId, generationId, repoName: currentRepoName },
      });
    }
    return {
      mode:
        currentBound.segmentKind === 'no-local-segment'
          ? 'no-local-segment'
          : 'live',
      predecessor:
        currentBound.predecessorGenerationId === null ||
        currentBound.predecessorRepoName === null ||
        currentBound.predecessorTerminalFrontendIndex === null
          ? null
          : {
              generationId: currentBound.predecessorGenerationId,
              repoName: currentBound.predecessorRepoName,
              terminalFrontendIndex:
                currentBound.predecessorTerminalFrontendIndex,
            },
    };
  }

  // 3. Walk only SystemRepo control state. A missing physical segment and a
  // recorded no-local segment both defer to the next older generation.
  let ancestorGenerationId = generationState.prevGenerationId;
  const visitedGenerationIds: string[] = [generationId];
  let predecessor: Readonly<{
    generationId: string;
    repoName: string;
    terminalFrontendIndex: number;
  }> | null = null;
  while (ancestorGenerationId !== null) {
    const currentAncestorGenerationId = ancestorGenerationId;
    if (visitedGenerationIds.includes(currentAncestorGenerationId)) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-generation-cycle',
        message: 'Frontend lineage contains a generation cycle',
        extra: {
          deployId,
          generationId,
          ancestorGenerationId: currentAncestorGenerationId,
          kind: target.kind,
        },
      });
    }
    visitedGenerationIds.push(currentAncestorGenerationId);

    const ancestorStateEncoded = yield* makeAsync(() =>
      SystemRepo.getRepo({
        generationId: currentAncestorGenerationId,
      }).getGenerationState(),
    );
    const ancestorState = yield* decodeRpc(ancestorStateEncoded);
    if (ancestorState === null) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-ancestor-state-required',
        message:
          'Frontend lineage references an ancestor with no generation state',
        extra: {
          generationId,
          ancestorGenerationId: currentAncestorGenerationId,
          kind: target.kind,
        },
      });
    }
    if (
      ancestorState.generationId !== currentAncestorGenerationId ||
      ancestorState.readiness !== 'ready' ||
      ancestorState.activeDeployId === null ||
      ancestorState.drainFrozenAt === null ||
      (ancestorState.admission !== 'draining' &&
        ancestorState.admission !== 'drained')
    ) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-ancestor-not-frozen',
        message:
          'Frontend lineage can traverse only ready ancestors with frozen bounds',
        extra: {
          generationId,
          ancestorGenerationId: currentAncestorGenerationId,
          storedGenerationId: ancestorState.generationId,
          readiness: ancestorState.readiness,
          admission: ancestorState.admission,
          drainFrozenAt: ancestorState.drainFrozenAt,
        },
      });
    }

    const ancestorRepoName =
      target.kind === 'account'
        ? yield* FrontendRepo.repoUtils.nameUtils.makeName({
            generationId: currentAncestorGenerationId,
            accountId: target.accountId,
            accountName: target.accountName,
            actorId: target.actorId,
            actorName: target.actorName,
            frontendName: target.frontendName,
          })
        : yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName({
            generationId: currentAncestorGenerationId,
            serviceName: target.serviceName,
            actorName: target.actorName,
            actorId: target.actorId,
            frontendName: target.frontendName,
          });
    const ancestorBound = ancestorState.drainBounds.find(
      bound =>
        bound.repoName === ancestorRepoName &&
        bound.repoType ===
          (target.kind === 'account' ? 'FrontendRepo' : 'ServiceFrontendRepo'),
    );
    if (ancestorBound !== undefined) {
      if (ancestorBound.segmentKind === null) {
        return yield* new ZerospinError({
          code: 'frontend-lineage-ancestor-segment-kind-required',
          message:
            'Frozen ancestor projection has no lineage segment classification',
          extra: {
            generationId,
            ancestorGenerationId: currentAncestorGenerationId,
            repoName: ancestorRepoName,
          },
        });
      }
      if (ancestorBound.segmentKind !== 'no-local-segment') {
        if (
          ancestorBound.frontendBlockRepoName === null ||
          ancestorBound.terminalFrontendIndex === null ||
          !Number.isInteger(ancestorBound.terminalFrontendIndex) ||
          ancestorBound.terminalFrontendIndex < 0
        ) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-ancestor-bound-incomplete',
            message:
              'Frozen ancestor projection lacks a complete real archive descriptor',
            extra: {
              generationId,
              ancestorGenerationId: currentAncestorGenerationId,
              repoName: ancestorRepoName,
            },
          });
        }
        predecessor = {
          generationId: currentAncestorGenerationId,
          repoName: ancestorBound.frontendBlockRepoName,
          terminalFrontendIndex: ancestorBound.terminalFrontendIndex,
        };
        break;
      }
    }

    ancestorGenerationId = ancestorState.prevGenerationId;
  }

  // 4. Re-read lifecycle state and reserve every live projection in one
  // synchronous transaction. The reservation makes an admitted projection
  // visible to freeze before any external projection/bootstrap RPC begins.
  return yield* makeTx({
    db,
    program: Effect.fn(
      'SystemRepo.resolveFrontendProjectionLineage.reserve.transaction',
    )(function* ({ tx }) {
      const latestRawGenerationState = tx
        .select()
        .from(generationStateTable)
        .where(eq(generationStateColumns.generationId, generationId))
        .get();
      if (latestRawGenerationState === undefined) {
        return yield* new ZerospinError({
          code: 'frontend-lineage-generation-state-required',
          message:
            'Frontend lineage cannot be reserved without generation state',
          extra: { deployId, generationId, kind: target.kind },
        });
      }
      const latestGenerationState = yield* Schema.decodeUnknown(
        Schema.Struct({
          generationId: Schema.String,
          activeDeployId: Schema.NullOr(Schema.String),
          readiness: Schema.Literal('initializing', 'ready', 'failed'),
          admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
          drainFrozenAt: Schema.NullOr(Schema.DateFromSelf),
        }),
      )(latestRawGenerationState).pipe(
        mapParseError({
          code: 'frontend-lineage-generation-state-invalid',
          prefix:
            'Stored generation state changed to an invalid value while reserving frontend lineage',
          extra: { deployId, generationId, kind: target.kind },
        }),
      );
      if (
        latestGenerationState.generationId !== generationId ||
        latestGenerationState.readiness !== 'ready' ||
        latestGenerationState.activeDeployId !== deployId ||
        (latestGenerationState.admission !== 'open' &&
          latestGenerationState.admission !== 'draining')
      ) {
        return yield* new ZerospinError({
          code: 'frontend-lineage-read-admission-closed',
          message:
            'Frontend lineage changed before its projection admission could be reserved',
          extra: {
            deployId,
            generationId,
            storedGenerationId: latestGenerationState.generationId,
            activeDeployId: latestGenerationState.activeDeployId,
            readiness: latestGenerationState.readiness,
            admission: latestGenerationState.admission,
          },
        });
      }

      const concurrentRawBound = tx
        .select()
        .from(drainBoundsTable)
        .where(
          and(
            eq(drainBoundsColumns.deployId, deployId),
            eq(drainBoundsColumns.repoName, currentRepoName),
          ),
        )
        .get();
      if (concurrentRawBound !== undefined) {
        const concurrentBound = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal('FrontendRepo', 'ServiceFrontendRepo'),
            systemWorkerName: Schema.NullOr(Schema.String),
            frontendBlockRepoName: Schema.NullOr(Schema.String),
            terminalFrontendIndex: Schema.NullOr(Schema.Number),
            segmentKind: Schema.Literal(
              'root',
              'inherited',
              'no-local-segment',
            ),
            predecessorGenerationId: Schema.NullOr(Schema.String),
            predecessorRepoName: Schema.NullOr(Schema.String),
            predecessorTerminalFrontendIndex: Schema.NullOr(Schema.Number),
          }),
        )(concurrentRawBound).pipe(
          mapParseError({
            code: 'frontend-lineage-current-bound-invalid',
            prefix:
              'Concurrently stored current projection bound is invalid while reserving lineage',
            extra: { deployId, generationId, repoName: currentRepoName },
          }),
        );
        if (concurrentBound.repoType !== currentRepoType) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-current-bound-kind-mismatch',
            message:
              'Concurrently stored current projection bound belongs to another frontend kind',
            extra: {
              deployId,
              generationId,
              repoName: currentRepoName,
              expectedRepoType: currentRepoType,
              storedRepoType: concurrentBound.repoType,
            },
          });
        }
        if (
          (concurrentBound.predecessorGenerationId === null &&
            (concurrentBound.predecessorRepoName !== null ||
              concurrentBound.predecessorTerminalFrontendIndex !== null)) ||
          (concurrentBound.predecessorGenerationId !== null &&
            (concurrentBound.predecessorRepoName === null ||
              concurrentBound.predecessorTerminalFrontendIndex === null))
        ) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-current-predecessor-incomplete',
            message:
              'Concurrently stored current projection predecessor descriptor is incomplete',
            extra: { deployId, generationId, repoName: currentRepoName },
          });
        }
        const incompleteReservation =
          concurrentBound.systemWorkerName === null &&
          concurrentBound.frontendBlockRepoName === null &&
          concurrentBound.terminalFrontendIndex === null;
        const completeBound =
          concurrentBound.systemWorkerName !== null &&
          concurrentBound.frontendBlockRepoName !== null &&
          concurrentBound.terminalFrontendIndex !== null;
        if (
          (!incompleteReservation && !completeBound) ||
          (incompleteReservation &&
            concurrentBound.segmentKind === 'no-local-segment')
        ) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-current-bound-incomplete',
            message:
              'Concurrently stored current projection bound is neither an admission reservation nor a complete frozen bound',
            extra: { deployId, generationId, repoName: currentRepoName },
          });
        }
        if (
          incompleteReservation &&
          latestGenerationState.drainFrozenAt !== null
        ) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-frozen-reservation-incomplete',
            message:
              'Frozen generation contains an incomplete frontend projection admission reservation',
            extra: { deployId, generationId, repoName: currentRepoName },
          });
        }
        return {
          mode:
            concurrentBound.segmentKind === 'no-local-segment'
              ? 'no-local-segment'
              : 'live',
          predecessor:
            concurrentBound.predecessorGenerationId === null ||
            concurrentBound.predecessorRepoName === null ||
            concurrentBound.predecessorTerminalFrontendIndex === null
              ? null
              : {
                  generationId: concurrentBound.predecessorGenerationId,
                  repoName: concurrentBound.predecessorRepoName,
                  terminalFrontendIndex:
                    concurrentBound.predecessorTerminalFrontendIndex,
                },
        } satisfies Readonly<{
          mode: 'live' | 'no-local-segment';
          predecessor: Readonly<{
            generationId: string;
            repoName: string;
            terminalFrontendIndex: number;
          }> | null;
        }>;
      }

      // Closing write admission starts the drain, but it does not yet make a
      // source snapshot terminal. Until drainFrozenAt is durable, a read that
      // creates a projection must still reserve a live segment so the final
      // freeze transaction either includes it or visibly rejects the attempt.
      if (
        latestGenerationState.admission === 'draining' &&
        latestGenerationState.drainFrozenAt !== null
      ) {
        return {
          mode: 'no-local-segment',
          predecessor,
        } satisfies Readonly<{
          mode: 'live' | 'no-local-segment';
          predecessor: Readonly<{
            generationId: string;
            repoName: string;
            terminalFrontendIndex: number;
          }> | null;
        }>;
      }

      tx.insert(drainBoundsTable)
        .values({
          deployId,
          repoType: currentRepoType,
          repoName: currentRepoName,
          terminalCursor: null,
          terminalIndex: null,
          systemWorkerName: null,
          frontendBlockRepoName: null,
          terminalFrontendIndex: null,
          segmentKind: predecessor === null ? 'root' : 'inherited',
          predecessorGenerationId: predecessor?.generationId ?? null,
          predecessorRepoName: predecessor?.repoName ?? null,
          predecessorTerminalFrontendIndex:
            predecessor?.terminalFrontendIndex ?? null,
          capturedAt: new Date(),
        })
        .onConflictDoNothing()
        .run();

      return {
        mode: 'live',
        predecessor,
      } satisfies Readonly<{
        mode: 'live' | 'no-local-segment';
        predecessor: Readonly<{
          generationId: string;
          repoName: string;
          terminalFrontendIndex: number;
        }> | null;
      }>;
    }),
  });
});
