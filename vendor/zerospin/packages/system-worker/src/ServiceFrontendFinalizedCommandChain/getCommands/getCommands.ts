import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { asc, desc, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceFrontendFinalizedCommandChainDrizzleSchemas } from '../ServiceFrontendFinalizedCommandChainDbConfig.js';

export const getCommands = Effect.fn(
  'ServiceFrontendFinalizedCommandChain.getCommands',
)(function* (props: { afterServiceFrontendIndex: number; db: IDb }) {
  const rows = props.db
    .select()
    .from(serviceFrontendFinalizedCommandChainDrizzleSchemas.commands)
    .where(
      gt(
        serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
          .serviceFrontendIndex,
        props.afterServiceFrontendIndex,
      ),
    )
    .orderBy(
      asc(
        serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
          .serviceFrontendIndex,
      ),
    )
    .limit(64)
    .all();
  const tip =
    props.db
      .select({
        serviceFrontendIndex:
          serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
            .serviceFrontendIndex,
      })
      .from(serviceFrontendFinalizedCommandChainDrizzleSchemas.commands)
      .orderBy(
        desc(
          serviceFrontendFinalizedCommandChainDrizzleSchemas.commands
            .serviceFrontendIndex,
        ),
      )
      .limit(1)
      .get()?.serviceFrontendIndex ?? 0;
  const commands: IEncodedCommand<IServiceFrontendFinalizedCommand>[] = [];
  let expectedServiceFrontendIndex = props.afterServiceFrontendIndex + 1;
  for (const row of rows) {
    if (row.serviceFrontendIndex !== expectedServiceFrontendIndex) {
      return yield* new ZerospinError({
        code: 'service-frontend-finalized-command-index-gap',
        message: `ServiceFrontendFinalizedCommandChain expected serviceFrontendIndex ${expectedServiceFrontendIndex}, received ${row.serviceFrontendIndex}`,
      });
    }
    commands.push(
      yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
      )(row.canonicalBytes).pipe(
        mapParseError({
          code: 'service-frontend-finalized-command-invalid',
          prefix: `Failed to decode service frontend command ${row.serviceFrontendIndex}`,
        }),
      ),
    );
    expectedServiceFrontendIndex += 1;
  }
  return { commands, tip };
});
