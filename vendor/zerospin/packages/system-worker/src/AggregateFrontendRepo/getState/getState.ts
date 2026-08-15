import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import type {
  IAggregateId,
  IAnyDrizzleSchemas,
  IEncodedResourceShape,
  IModel,
  IModels,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { getTableName } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import {
  aggregateFrontendBlockDrizzleSchemas,
  AggregateFrontendBlockRepo,
} from '../../AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
import { getAggregateFrontendBlockRepo } from '../../AggregateFrontendBlockRepo/getAggregateFrontendBlockRepo/getAggregateFrontendBlockRepo.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';
import { bootstrap, FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { catchup } from '../catchup/catchup.js';

export const getState = Effect.fn('AggregateFrontendRepo.getState')(
  function* (props: {
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
    configuredSystemId: string;
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    name: string;
    db: IDb;
    aggregateFrontendRepoSchema: IAnyDrizzleSchemas &
      Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
    storage: DurableObjectStorage;
    lineage: Readonly<{
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Effect.fn.Return<
    IAggregateFrontendSyncState,
    IAnyError,
    Async | CuidFactory
  > {
    const {
      configuredSystemId,
      db,
      aggregateFrontendRepoSchema,
      key,
      lineage,
      name,
      storage,
    } = props;
    const systemId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-system-id-invalid',
        prefix: 'Failed to decode configured frontend systemId',
      }),
    );
    const generationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(key.generationId).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-generation-id-invalid',
        prefix: 'Failed to decode AggregateFrontendRepo generationId',
      }),
    );
    const aggregateId: IAggregateId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.aggregate),
    )(key.aggregateId).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-aggregate-id-invalid',
        prefix: 'Failed to decode AggregateFrontendRepo aggregateId',
      }),
    );
    const userId: string = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
      key.userId,
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-user-id-invalid',
        prefix: 'Failed to decode AggregateFrontendRepo userId',
      }),
    );
    if (
      props.aggregateId !== aggregateId ||
      props.aggregateName !== key.aggregateName ||
      props.userId !== userId ||
      props.frontendName !== key.frontendName ||
      name.length === 0
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-state-target-mismatch',
        message:
          'Frontend state request does not match its bound repository target',
      });
    }
    yield* bootstrap({
      key,
      db,
      storage,
      lineage,
    });
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const frontendBinding = yield* getByKeyOrThrow({
      record: aggregate.frontends,
      key: key.frontendName,
      recordKind: `frontends owned by aggregate ${key.aggregateName}`,
    });
    const frontendController = frontendBinding.controller;
    const frontendModels: IModels = frontendController.models;

    const segmentKind = yield* Schema.decodeUnknown(
      Schema.Literal('root', 'inherited'),
    )(storage.kv.get('segmentKind')).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-segment-kind-invalid',
        prefix: 'Failed to decode AggregateFrontendRepo segment kind',
      }),
    );

    const aggregateFrontendBlockRepo = yield* getAggregateFrontendBlockRepo({
      key,
    });
    const recordPredecessorUnknown = yield* makeAsync(() =>
      aggregateFrontendBlockRepo.recordPredecessor({
        systemId,
        predecessor: lineage.predecessor,
      }),
    );
    const recordPredecessorEncoded = yield* Schema.decodeUnknown(
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
    )(recordPredecessorUnknown).pipe(
      mapParseError({
        code: 'aggregate-frontend-record-lineage-rpc-invalid',
        prefix: 'Failed to decode AggregateFrontendBlockRepo lineage RPC',
      }),
    );
    yield* decodeRpc(recordPredecessorEncoded);

    const emissionMode = yield* Schema.decodeUnknown(
      Schema.Literal('live', 'no-emission'),
    )(storage.kv.get('emissionMode')).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-emission-mode-invalid',
        prefix: 'Failed to decode AggregateFrontendRepo emission mode',
      }),
    );
    const storedFrontendIndex = yield* Schema.decodeUnknown(Schema.Number)(
      storage.kv.get(FRONTEND_INDEX_KV_KEY),
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-state-index-invalid',
        prefix: 'Failed to decode AggregateFrontendRepo frontend index',
      }),
    );
    if (segmentKind === 'inherited') {
      if (lineage.predecessor === null) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-state-predecessor-required',
          message:
            'Inherited AggregateFrontendRepo state requires a predecessor',
        });
      }
      if (
        (emissionMode === 'no-emission' &&
          storedFrontendIndex !== lineage.predecessor.terminalFrontendIndex) ||
        (emissionMode === 'live' &&
          storedFrontendIndex < lineage.predecessor.terminalFrontendIndex)
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-state-inherited-index-conflict',
          message:
            'Inherited AggregateFrontendRepo state does not match its boundary index',
        });
      }
    } else if (lineage.predecessor !== null || storedFrontendIndex < 0) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-state-root-lineage-conflict',
        message:
          'Root AggregateFrontendRepo state cannot have inherited lineage',
      });
    }

    const aggregateBlockRepo = yield* getAggregateBlockRepo({
      key: {
        generationId: key.generationId,
        aggregateId: key.aggregateId,
        aggregateName: key.aggregateName,
      },
    });
    if (storage.kv.get('subscribed') !== true) {
      const caughtUp = yield* catchup({
        db,
        aggregateFrontendRepoSchema,
        key,
        storage,
      });
      const caughtUpFrontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
      if (
        emissionMode === 'no-emission' &&
        caughtUpFrontendIndex !==
          (lineage.predecessor?.terminalFrontendIndex ?? 0)
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-state-no-emission-violated',
          message:
            'AggregateFrontendRepo catch-up changed the logical frontend index while no-emission mode was active',
        });
      }
      storage.kv.put('emissionMode', 'live');
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
    } else if (emissionMode !== 'live') {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-state-subscribed-emission-mode-invalid',
        message:
          'A subscribed AggregateFrontendRepo must use live emission mode',
      });
    }

    const currentFrontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
    if (
      segmentKind === 'inherited' &&
      lineage.predecessor !== null &&
      (typeof currentFrontendIndex !== 'number' ||
        currentFrontendIndex < lineage.predecessor.terminalFrontendIndex)
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-state-inherited-index-conflict',
        message:
          'Inherited AggregateFrontendRepo state does not match its boundary index',
      });
    }

    const aggregateFrontendBlockRepoName =
      yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
        key,
      );
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
    const resources: IEncodedResourceShape[] = [];
    for (const modelName of Object.keys(frontendModels)) {
      const model = yield* getByKeyOrThrow({
        record: frontendModels,
        key: modelName,
        recordKind: 'frontend models',
      });
      for (const row of db.select().from(model.drizzleSchema).all()) {
        yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
          row,
          { onExcessProperty: 'error' },
        ).pipe(
          Effect.flatMap(decoded =>
            Schema.validate(model.resourceSchema)(decoded, {
              onExcessProperty: 'error',
            }),
          ),
          mapParseError({
            code: 'aggregate-frontend-state-resource-invalid',
            prefix: `Failed to decode frontend state resource ${model.modelName}`,
          }),
        );
        resources.push(
          yield* Schema.validate(EncodedResourceSchema)(row).pipe(
            mapParseError({
              code: 'aggregate-frontend-state-resource-row-invalid',
              prefix: `Failed to validate frontend state resource row ${model.modelName}`,
            }),
          ),
        );
      }
    }
    const frontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
    return {
      aggregateId,
      userId,
      systemId,
      systemVersion: system.version,
      aggregateName: key.aggregateName,
      frontendName: key.frontendName,
      frontendIndex: typeof frontendIndex === 'number' ? frontendIndex : 0,
      pushedCommands: db
        .select()
        .from(aggregateFrontendRepoDrizzleSchemas.pushedCommands)
        .all(),
      resources,
      executedPushedCommands: db
        .select()
        .from(aggregateFrontendRepoDrizzleSchemas.executedPushedCommands)
        .all(),
      failedPushedCommands: db
        .select()
        .from(aggregateFrontendRepoDrizzleSchemas.failedPushedCommands)
        .all(),
    };
  },
);
