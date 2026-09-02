import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IAggregateId, IModel } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { asc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import type { AggregateCommandChain } from '../../AggregateCommandChain/AggregateCommandChain.js';
import { catchup } from '../catchup/catchup.js';
import { materializedAggregateFrontendRepoDrizzleSchemas } from '../MaterializedAggregateFrontendRepoDbConfig.js';

export const getState = Effect.fn('MaterializedAggregateFrontendRepo.getState')(
  function* (props: {
    aggregateCommandChains: Readonly<{
      getByName(name: string): Pick<AggregateCommandChain, 'getCommands'>;
    }>;
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    requested: {
      aggregateId: IAggregateId;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    schema: Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
  }) {
    if (
      props.requested.aggregateId !== props.key.aggregateId ||
      props.requested.aggregateName !== props.key.aggregateName ||
      props.requested.userId !== props.key.userId ||
      props.requested.frontendName !== props.key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-state-target-mismatch',
        message: 'Requested projection state does not match its bound target',
      });
    }
    yield* catchup({
      aggregateCommandChains: props.aggregateCommandChains,
      db: props.db,
      key: props.key,
      schema: props.schema,
      throughAggregateIndex: undefined,
    });
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: props.key.aggregateName,
      recordKind: 'aggregates',
    });
    const frontendBinding = yield* getByKeyOrThrow({
      record: aggregate.frontends,
      key: props.key.frontendName,
      recordKind: `frontends owned by aggregate ${props.key.aggregateName}`,
    });
    const systemId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(props.key.systemId).pipe(
      mapParseError({
        code: 'materialized-aggregate-frontend-system-id-invalid',
        prefix: 'Failed to decode the materialized frontend systemId',
      }),
    );
    const state = props.db
      .select()
      .from(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
      .where(
        eq(
          materializedAggregateFrontendRepoDrizzleSchemas.projectionState.id,
          1,
        ),
      )
      .get();
    if (state === undefined || state.status !== 'ready') {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-not-ready',
        message: 'Materialized aggregate frontend state is not ready',
      });
    }
    if (
      state.systemId !== props.key.systemId ||
      state.aggregateId !== props.key.aggregateId ||
      state.aggregateName !== props.key.aggregateName ||
      state.userId !== props.key.userId ||
      state.frontendName !== props.key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-state-target-mismatch',
        message: 'Persisted projection state belongs to another target',
      });
    }
    const resources = [];
    for (const model of Object.values(frontendBinding.controller.models)) {
      for (const row of props.db.select().from(model.drizzleSchema).all()) {
        resources.push(
          yield* Schema.decodeEffect(Schema.toType(EncodedResourceSchema))(
            row,
          ).pipe(
            mapParseError({
              code: 'materialized-aggregate-frontend-state-resource-invalid',
              prefix: `Failed to decode frontend resource ${model.modelName}`,
            }),
          ),
        );
      }
    }
    const resolvedPushIndexes = props.db
      .select({
        pushIndex:
          materializedAggregateFrontendRepoDrizzleSchemas.resolvedPushes
            .pushIndex,
      })
      .from(materializedAggregateFrontendRepoDrizzleSchemas.resolvedPushes)
      .orderBy(
        asc(
          materializedAggregateFrontendRepoDrizzleSchemas.resolvedPushes
            .pushIndex,
        ),
      )
      .all()
      .map(row => row.pushIndex);
    return {
      aggregateId: props.requested.aggregateId,
      userId: props.key.userId,
      systemId,
      systemVersion: system.version,
      aggregateName: props.key.aggregateName,
      frontendName: props.key.frontendName,
      aggregateIndex: state.aggregateIndex,
      frontendIndex: state.frontendIndex,
      pushIndex: state.pushIndex,
      resolvedPushIndexes,
      resources,
    };
  },
);
