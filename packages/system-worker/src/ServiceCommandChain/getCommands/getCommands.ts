import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, asc, desc, gt, isNotNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceCommandChainDrizzleSchemas } from '../ServiceCommandChainDbConfig.js';

export const getCommands = Effect.fn('ServiceCommandChain.getCommands')(
  function* (props: { db: IDb; afterServiceIndex: number | null }) {
    const rows = props.db
      .select()
      .from(serviceCommandChainDrizzleSchemas.commands)
      .where(
        props.afterServiceIndex === null
          ? isNotNull(serviceCommandChainDrizzleSchemas.commands.result)
          : and(
              gt(
                serviceCommandChainDrizzleSchemas.commands.serviceIndex,
                props.afterServiceIndex,
              ),
              isNotNull(serviceCommandChainDrizzleSchemas.commands.result),
            ),
      )
      .orderBy(asc(serviceCommandChainDrizzleSchemas.commands.serviceIndex))
      .limit(64)
      .all();
    const tip = props.db
      .select({
        serviceIndex: serviceCommandChainDrizzleSchemas.commands.serviceIndex,
      })
      .from(serviceCommandChainDrizzleSchemas.commands)
      .where(isNotNull(serviceCommandChainDrizzleSchemas.commands.result))
      .orderBy(desc(serviceCommandChainDrizzleSchemas.commands.serviceIndex))
      .limit(1)
      .get()?.serviceIndex;
    const commands: Schema.Schema.Type<typeof ServiceChainedCommandSchema>[] =
      [];
    let expected = (props.afterServiceIndex ?? 0) + 1;
    for (const row of rows) {
      if (row.serviceIndex !== expected) {
        return yield* new ZerospinError({
          code: 'service-command-chain-index-gap',
          message: `ServiceCommandChain expected serviceIndex ${expected}, received ${row.serviceIndex}`,
        });
      }
      commands.push(
        yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(ServiceChainedCommandSchema),
        )(row.result).pipe(
          mapParseError({
            code: 'service-command-chain-command-invalid',
            prefix: `Failed to decode service command ${row.serviceIndex}`,
          }),
        ),
      );
      expected += 1;
    }
    return { commands, tip: tip ?? null };
  },
);
