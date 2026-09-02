import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, asc, desc, gt, isNotNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const getCommands = Effect.fn('AggregateCommandChain.getCommands')(
  function* (props: { db: IDb; afterAggregateIndex: number | null }) {
    const { afterAggregateIndex, db } = props;
    const rows = db
      .select()
      .from(aggregateCommandChainDrizzleSchemas.commands)
      .where(
        afterAggregateIndex === null
          ? isNotNull(aggregateCommandChainDrizzleSchemas.commands.result)
          : and(
              gt(
                aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
                afterAggregateIndex,
              ),
              isNotNull(aggregateCommandChainDrizzleSchemas.commands.result),
            ),
      )
      .orderBy(asc(aggregateCommandChainDrizzleSchemas.commands.aggregateIndex))
      .limit(64)
      .all();
    const tipRow = db
      .select({
        aggregateIndex:
          aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
      })
      .from(aggregateCommandChainDrizzleSchemas.commands)
      .where(isNotNull(aggregateCommandChainDrizzleSchemas.commands.result))
      .orderBy(
        desc(aggregateCommandChainDrizzleSchemas.commands.aggregateIndex),
      )
      .limit(1)
      .get();

    const commands: Schema.Schema.Type<typeof AggregateChainedCommandSchema>[] =
      [];
    let expectedAggregateIndex = (afterAggregateIndex ?? 0) + 1;
    for (const row of rows) {
      if (row.aggregateIndex !== expectedAggregateIndex) {
        return yield* new ZerospinError({
          code: 'aggregate-command-chain-index-gap',
          message: `AggregateCommandChain expected aggregateIndex ${expectedAggregateIndex}, received ${row.aggregateIndex}`,
        });
      }
      const command = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateChainedCommandSchema),
      )(row.result).pipe(
        mapParseError({
          code: 'aggregate-command-chain-command-invalid',
          prefix: `Failed to decode aggregate command ${row.aggregateIndex}`,
        }),
      );
      commands.push(command);
      expectedAggregateIndex += 1;
    }

    return { commands, tip: tipRow?.aggregateIndex ?? null };
  },
);
