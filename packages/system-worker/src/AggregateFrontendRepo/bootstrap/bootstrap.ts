import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

const INITIALIZED_KV_KEY = 'initialized';
export const FRONTEND_INDEX_KV_KEY = 'frontendIndex';

/** Initializes an empty AggregateFrontendRepo before AggregateBlockRepo history replay. */
export const bootstrap = Effect.fn('AggregateFrontendRepo.bootstrap')(
  function* (props: {
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    db: IDb;
    storage: DurableObjectStorage;
    lineage: Readonly<{
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Effect.fn.Return<void, IAnyError> {
    const { db, key, lineage, storage } = props;
    const expectedSegmentKind =
      lineage.predecessor === null ? 'root' : 'inherited';
    const initialized = storage.kv.get(INITIALIZED_KV_KEY);
    if (initialized === true) {
      const storedSegmentKind = storage.kv.get('segmentKind');
      const storedPredecessorGenerationId =
        storage.kv.get('predecessorGenerationId') ?? null;
      const storedPredecessorRepoName =
        storage.kv.get('predecessorRepoName') ?? null;
      const storedPredecessorTerminalFrontendIndex =
        storage.kv.get('predecessorTerminalFrontendIndex') ?? null;
      if (
        storedSegmentKind !== expectedSegmentKind ||
        storedPredecessorGenerationId !==
          (lineage.predecessor?.generationId ?? null) ||
        storedPredecessorRepoName !== (lineage.predecessor?.repoName ?? null) ||
        storedPredecessorTerminalFrontendIndex !==
          (lineage.predecessor?.terminalFrontendIndex ?? null)
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-bootstrap-lineage-conflict',
          message:
            'Stored AggregateFrontendRepo lineage does not match this state retry',
          extra: {
            generationId: key.generationId,
            aggregateId: key.aggregateId,
            userId: key.userId,
            frontendName: key.frontendName,
            expectedSegmentKind,
            storedSegmentKind,
          },
        });
      }
      return;
    }
    if (initialized !== undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-bootstrap-initialized-marker-invalid',
        message:
          'AggregateFrontendRepo initialized marker must be true when present',
      });
    }
    if (
      lineage.predecessor !== null &&
      (lineage.predecessor.generationId === key.generationId ||
        lineage.predecessor.repoName.length === 0 ||
        !Number.isInteger(lineage.predecessor.terminalFrontendIndex) ||
        lineage.predecessor.terminalFrontendIndex < 0)
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-bootstrap-predecessor-invalid',
        message:
          'AggregateFrontendRepo predecessor must identify an older archive and non-negative terminal index',
      });
    }

    yield* makeTx({
      db,
      program: Effect.fn('AggregateFrontendRepo.bootstrap.initialize')(
        function* () {
          yield* Effect.void;
          storage.kv.put(
            FRONTEND_INDEX_KV_KEY,
            lineage.predecessor?.terminalFrontendIndex ?? 0,
          );
          storage.kv.put('emissionMode', 'no-emission');
          storage.kv.put('segmentKind', expectedSegmentKind);
          if (lineage.predecessor === null) {
            storage.kv.delete('predecessorGenerationId');
            storage.kv.delete('predecessorRepoName');
            storage.kv.delete('predecessorTerminalFrontendIndex');
          } else {
            storage.kv.put(
              'predecessorGenerationId',
              lineage.predecessor.generationId,
            );
            storage.kv.put('predecessorRepoName', lineage.predecessor.repoName);
            storage.kv.put(
              'predecessorTerminalFrontendIndex',
              lineage.predecessor.terminalFrontendIndex,
            );
          }
          storage.kv.put(INITIALIZED_KV_KEY, true);
        },
      ),
    });
  },
);
