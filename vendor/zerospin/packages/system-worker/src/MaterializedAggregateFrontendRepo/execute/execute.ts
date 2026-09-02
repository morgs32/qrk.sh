import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IModel } from '@zerospin/core/models/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { AggregateCommandChain } from '../../AggregateCommandChain/AggregateCommandChain.js';
import { catchup } from '../catchup/catchup.js';
import { materializedAggregateFrontendRepoDrizzleSchemas } from '../MaterializedAggregateFrontendRepoDbConfig.js';

export const execute = Effect.fn('MaterializedAggregateFrontendRepo.execute')(
  function* (props: {
    aggregateCommandChains: Readonly<{
      getByName(name: string): Pick<AggregateCommandChain, 'getCommands'>;
    }>;
    command: Schema.Schema.Type<typeof AggregateChainedCommandSchema>;
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    schema: Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
  }) {
    if (props.command.delta === null) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-source-command-pending',
        message:
          'Aggregate frontend projection cannot consume a pending source command',
      });
    }
    const canonicalBytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(AggregateChainedCommandSchema),
    )(props.command).pipe(
      mapParseError({
        code: 'materialized-aggregate-frontend-source-command-encode-failed',
        prefix: `Failed to encode aggregate source ${props.command.aggregateIndex}`,
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
    if (state === undefined) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-state-missing',
        message: 'Projection state must exist before source delivery',
      });
    }
    if (props.command.aggregateIndex > state.aggregateIndex) {
      yield* catchup({
        aggregateCommandChains: props.aggregateCommandChains,
        db: props.db,
        key: props.key,
        schema: props.schema,
        throughAggregateIndex: props.command.aggregateIndex,
      });
    }
    const claim = props.db
      .select()
      .from(materializedAggregateFrontendRepoDrizzleSchemas.executionClaims)
      .where(
        or(
          eq(
            materializedAggregateFrontendRepoDrizzleSchemas.executionClaims
              .aggregateIndex,
            props.command.aggregateIndex,
          ),
          eq(
            materializedAggregateFrontendRepoDrizzleSchemas.executionClaims
              .commandId,
            props.command.id,
          ),
        ),
      )
      .get();
    if (
      claim === undefined ||
      claim.aggregateIndex !== props.command.aggregateIndex ||
      claim.commandId !== props.command.id ||
      claim.canonicalBytes !== canonicalBytes
    ) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-source-command-conflict',
        message: `Notified aggregate source ${props.command.aggregateIndex} differs from retained history`,
      });
    }
    if (claim.completedAt === null) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-execution-in-doubt',
        message: `Aggregate frontend execution ${props.command.aggregateIndex} was claimed without a retained result`,
      });
    }
    if (claim.result !== null) {
      yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
      )(claim.result).pipe(
        mapParseError({
          code: 'materialized-aggregate-frontend-result-invalid',
          prefix: `Failed to decode retained aggregate frontend result ${props.command.aggregateIndex}`,
        }),
      );
    }
  },
);
