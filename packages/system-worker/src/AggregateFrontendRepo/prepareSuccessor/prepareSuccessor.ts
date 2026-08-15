import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  IAggregateCursor,
  IAnyDrizzleSchemas,
  IModel,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { getTableName } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import {
  aggregateFrontendBlockDrizzleSchemas,
  AggregateFrontendBlockRepo,
} from '../../AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
import { getAggregateFrontendBlockRepo } from '../../AggregateFrontendBlockRepo/getAggregateFrontendBlockRepo/getAggregateFrontendBlockRepo.js';
import {
  getLastAggregateCursor,
  getLastAggregateIndex,
  setLastAggregateCursor,
  setLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { catchup } from '../catchup/catchup.js';

/** Rebuilds an inherited projection from the target AggregateBlockRepo. */
export const prepareSuccessor = Effect.fn(
  'AggregateFrontendRepo.prepareSuccessor',
)(function* (props: {
  lastAggregateCursor: IAggregateCursor | null;
  aggregateIndex: number | null;
  predecessor: Readonly<{
    generationId: string;
    repoName: string;
    terminalFrontendIndex: number;
  }>;
  configuredSystemId: string;
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  name: string;
  aggregateFrontendRepoSchema: IAnyDrizzleSchemas &
    Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async | CuidFactory> {
  const {
    aggregateIndex,
    db,
    aggregateFrontendRepoSchema,
    key,
    lastAggregateCursor,
    name,
    predecessor,
    storage,
  } = props;
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.configuredSystemId).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-system-id-invalid',
      prefix: 'Failed to decode configured successor systemId',
    }),
  );
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(key.generationId).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-generation-id-invalid',
      prefix: 'Failed to decode successor generationId',
    }),
  );
  yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(key.aggregateId).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-aggregate-id-invalid',
      prefix: 'Failed to decode successor aggregateId',
    }),
  );
  yield* Schema.decodeUnknown(Schema.NonEmptyString)(key.userId).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-user-id-invalid',
      prefix: 'Failed to decode successor userId',
    }),
  );
  const predecessorGenerationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(predecessor.generationId).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-predecessor-generation-invalid',
      prefix: 'Failed to decode predecessor generationId',
    }),
  );
  if (
    predecessorGenerationId === generationId ||
    predecessor.repoName.length === 0 ||
    !Number.isInteger(predecessor.terminalFrontendIndex) ||
    predecessor.terminalFrontendIndex < 0 ||
    name.length === 0 ||
    (lastAggregateCursor === null) !== (aggregateIndex === null) ||
    (aggregateIndex !== null &&
      (!Number.isInteger(aggregateIndex) || aggregateIndex < 1))
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-successor-source-mismatch',
      message:
        'Frontend successor aggregate watermark and predecessor descriptor must identify one exact logical frontend',
    });
  }

  const initialized = storage.kv.get('initialized');
  if (initialized === undefined) {
    yield* makeTx({
      db,
      program: Effect.fn('AggregateFrontendRepo.prepareSuccessor.initialize')(
        function* ({ tx }) {
          yield* setLastAggregateCursor({
            storage,
            tx,
            aggregateCursor: null,
          });
          yield* setLastAggregateIndex({
            storage,
            tx,
            aggregateIndex: null,
          });
          storage.kv.put(
            FRONTEND_INDEX_KV_KEY,
            predecessor.terminalFrontendIndex,
          );
          storage.kv.put('emissionMode', 'no-emission');
          storage.kv.put('segmentKind', 'inherited');
          storage.kv.put('predecessorGenerationId', predecessorGenerationId);
          storage.kv.put('predecessorRepoName', predecessor.repoName);
          storage.kv.put(
            'predecessorTerminalFrontendIndex',
            predecessor.terminalFrontendIndex,
          );
          storage.kv.put('initialized', true);
        },
      ),
    });
  } else if (initialized !== true) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-successor-initialization-marker-invalid',
      message:
        'AggregateFrontendRepo initialized marker must be true when present',
    });
  }

  const storedSegmentKind = yield* Schema.decodeUnknown(
    Schema.Literal('inherited'),
  )(storage.kv.get('segmentKind')).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-segment-kind-conflict',
      prefix:
        'Stored AggregateFrontendRepo segment does not match successor retry',
    }),
  );
  const storedPredecessorGenerationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(storage.kv.get('predecessorGenerationId')).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-predecessor-generation-conflict',
      prefix: 'Stored predecessor generation does not match successor retry',
    }),
  );
  const storedPredecessorRepoName = yield* Schema.decodeUnknown(Schema.String)(
    storage.kv.get('predecessorRepoName'),
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-predecessor-repo-conflict',
      prefix: 'Stored predecessor repo does not match successor retry',
    }),
  );
  const storedPredecessorTerminalFrontendIndex = yield* Schema.decodeUnknown(
    Schema.Number,
  )(storage.kv.get('predecessorTerminalFrontendIndex')).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-predecessor-index-conflict',
      prefix: 'Stored predecessor index does not match successor retry',
    }),
  );
  const emissionMode = yield* Schema.decodeUnknown(
    Schema.Literal('no-emission', 'live'),
  )(storage.kv.get('emissionMode')).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-emission-mode-conflict',
      prefix: 'Stored emission mode does not match successor preparation',
    }),
  );
  const frontendIndex = yield* Schema.decodeUnknown(Schema.Number)(
    storage.kv.get(FRONTEND_INDEX_KV_KEY),
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-index-conflict',
      prefix: 'Stored frontend index does not match successor preparation',
    }),
  );
  if (
    storedSegmentKind !== 'inherited' ||
    storedPredecessorGenerationId !== predecessorGenerationId ||
    storedPredecessorRepoName !== predecessor.repoName ||
    storedPredecessorTerminalFrontendIndex !==
      predecessor.terminalFrontendIndex ||
    (emissionMode === 'no-emission' &&
      frontendIndex !== predecessor.terminalFrontendIndex) ||
    (emissionMode === 'live' &&
      frontendIndex < predecessor.terminalFrontendIndex)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-successor-state-conflict',
      message:
        'Existing AggregateFrontendRepo state does not match this successor preparation retry',
    });
  }

  const aggregateFrontendBlockRepo = yield* getAggregateFrontendBlockRepo({
    key,
  });
  const recordUnknown = yield* makeAsync(() =>
    aggregateFrontendBlockRepo.recordPredecessor({
      systemId,
      predecessor,
    }),
  );
  const recordEncoded = yield* Schema.decodeUnknown(
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
  )(recordUnknown).pipe(
    mapParseError({
      code: 'aggregate-frontend-successor-predecessor-rpc-invalid',
      prefix: 'Failed to decode successor predecessor RPC',
    }),
  );
  yield* decodeRpc(recordEncoded);

  if (storage.kv.get('subscribed') !== true) {
    const caughtUp = yield* catchup({
      db,
      aggregateFrontendRepoSchema,
      key,
      storage,
    });
    if (
      caughtUp.lastAggregateCursor !== lastAggregateCursor ||
      caughtUp.aggregateIndex !== aggregateIndex
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-successor-target-watermark-mismatch',
        message:
          'Target AggregateBlockRepo history must reach the frozen aggregate watermark before successor registration',
        extra: {
          generationId: key.generationId,
          aggregateId: key.aggregateId,
          expectedLastAggregateCursor: lastAggregateCursor,
          actualLastAggregateCursor: caughtUp.lastAggregateCursor,
          expectedAggregateIndex: aggregateIndex,
          actualAggregateIndex: caughtUp.aggregateIndex,
        },
      });
    }
    if (
      storage.kv.get(FRONTEND_INDEX_KV_KEY) !==
      predecessor.terminalFrontendIndex
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-successor-no-emission-violated',
        message:
          'Successor catch-up changed the logical frontend index while no-emission mode was active',
      });
    }

    storage.kv.put('emissionMode', 'live');
    const aggregateBlockRepo = yield* getAggregateBlockRepo({
      key: {
        generationId: key.generationId,
        aggregateId: key.aggregateId,
        aggregateName: key.aggregateName,
      },
    });
    const subscribedEncoded = yield* makeAsync(() =>
      aggregateBlockRepo.subscribeAggregateFrontend({
        aggregateFrontendRepoName: name,
        userId: key.userId,
        frontendName: key.frontendName,
        currentAggregateCursor: caughtUp.lastAggregateCursor,
        currentAggregateIndex: caughtUp.aggregateIndex,
      }),
    );
    yield* decodeRpc(subscribedEncoded);
    storage.kv.put('subscribed', true);
  } else {
    if (emissionMode !== 'live') {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-successor-subscribed-emission-mode-invalid',
        message: 'A subscribed AggregateFrontendRepo successor must be live',
      });
    }
    const storedLastAggregateCursor = yield* getLastAggregateCursor({
      storage,
      defaultValue: null,
    });
    const storedAggregateIndex = yield* getLastAggregateIndex({
      storage,
      defaultValue: null,
    });
    if (
      storedLastAggregateCursor !== lastAggregateCursor ||
      storedAggregateIndex !== aggregateIndex
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-successor-subscribed-watermark-conflict',
        message:
          'Subscribed AggregateFrontendRepo successor does not match its frozen aggregate watermark',
      });
    }
  }

  const aggregateFrontendBlockRepoName =
    yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(key);
  yield* makeAsync(() =>
    SystemRepo.getRepo({ systemId }).registerRepos({
      generationId,
      frontendRepo: {
        repoType: 'AggregateFrontendRepo',
        repoName: name,
        tableNames: Object.values(aggregateFrontendRepoSchema).map(
          getTableName,
        ),
      },
      frontendBlockRepo: {
        repoType: 'AggregateFrontendBlockRepo',
        repoName: aggregateFrontendBlockRepoName,
        tableNames: Object.values(aggregateFrontendBlockDrizzleSchemas).map(
          getTableName,
        ),
      },
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
