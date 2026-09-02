import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendPushedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendPushedCommand } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, asc, desc, gt, isNotNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateFrontendPushedCommandChainDrizzleSchemas } from '../AggregateFrontendPushedCommandChainDbConfig.js';

export const getCommands = Effect.fn(
  'AggregateFrontendPushedCommandChain.getCommands',
)(function* (props: { afterPushIndex: number | null; db: IDb }) {
  const rows = props.db
    .select()
    .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
    .where(
      props.afterPushIndex === null
        ? isNotNull(
            aggregateFrontendPushedCommandChainDrizzleSchemas.commands.result,
          )
        : and(
            gt(
              aggregateFrontendPushedCommandChainDrizzleSchemas.commands
                .pushIndex,
              props.afterPushIndex,
            ),
            isNotNull(
              aggregateFrontendPushedCommandChainDrizzleSchemas.commands.result,
            ),
          ),
    )
    .orderBy(
      asc(aggregateFrontendPushedCommandChainDrizzleSchemas.commands.pushIndex),
    )
    .limit(64)
    .all();
  const tip =
    props.db
      .select({
        pushIndex:
          aggregateFrontendPushedCommandChainDrizzleSchemas.commands.pushIndex,
      })
      .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
      .where(
        isNotNull(
          aggregateFrontendPushedCommandChainDrizzleSchemas.commands.result,
        ),
      )
      .orderBy(
        desc(
          aggregateFrontendPushedCommandChainDrizzleSchemas.commands.pushIndex,
        ),
      )
      .limit(1)
      .get()?.pushIndex ?? 0;

  const commands: IEncodedCommand<IAggregateFrontendPushedCommand>[] = [];
  let expectedPushIndex = (props.afterPushIndex ?? 0) + 1;
  for (const row of rows) {
    if (row.pushIndex !== expectedPushIndex) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-pushed-command-chain-index-gap',
        message: `AggregateFrontendPushedCommandChain expected pushIndex ${expectedPushIndex}, received ${row.pushIndex}`,
      });
    }
    commands.push(
      yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateFrontendPushedCommandSchema),
      )(row.result).pipe(
        mapParseError({
          code: 'aggregate-frontend-pushed-command-chain-result-invalid',
          prefix: `Failed to decode pushed command ${row.pushIndex}`,
        }),
      ),
    );
    expectedPushIndex += 1;
  }
  return { commands, tip };
});
