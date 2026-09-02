import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { asc, desc, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateFrontendFinalizedCommandChainDrizzleSchemas } from '../AggregateFrontendFinalizedCommandChainDbConfig.js';

export const getCommands = Effect.fn(
  'AggregateFrontendFinalizedCommandChain.getCommands',
)(function* (props: { afterFrontendIndex: number; db: IDb }) {
  const rows = props.db
    .select()
    .from(aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .where(
      gt(
        aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
          .frontendIndex,
        props.afterFrontendIndex,
      ),
    )
    .orderBy(
      asc(
        aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
          .frontendIndex,
      ),
    )
    .limit(64)
    .all();
  const tip =
    props.db
      .select({
        frontendIndex:
          aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
            .frontendIndex,
      })
      .from(aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands)
      .orderBy(
        desc(
          aggregateFrontendFinalizedCommandChainDrizzleSchemas.commands
            .frontendIndex,
        ),
      )
      .limit(1)
      .get()?.frontendIndex ?? 0;
  const commands: IEncodedCommand<IAggregateFrontendFinalizedCommand>[] = [];
  let expectedFrontendIndex = props.afterFrontendIndex + 1;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-finalized-command-index-gap',
        message: `AggregateFrontendFinalizedCommandChain expected frontendIndex ${expectedFrontendIndex}, received ${row.frontendIndex}`,
      });
    }
    commands.push(
      yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
      )(row.canonicalBytes).pipe(
        mapParseError({
          code: 'aggregate-frontend-finalized-command-invalid',
          prefix: `Failed to decode aggregate frontend command ${row.frontendIndex}`,
        }),
      ),
    );
    expectedFrontendIndex += 1;
  }
  return { commands, tip };
});
