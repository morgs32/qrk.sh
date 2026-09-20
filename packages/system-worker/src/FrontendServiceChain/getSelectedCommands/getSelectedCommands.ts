import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceSelectedCommandSchema } from '@zerospin/core/serviceSession/ServiceSelectedCommandSchema';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { asc, desc, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { frontendServiceChainDbConfig } from '../frontendServiceChainDbConfig.js';
/*
 * Frontend reconnects and snapshot publication checks read the retained FSC
 * log. This reader returns a bounded, validated contiguous suffix plus the
 * current publication tip.
 *
 * 1. Validate the replay cursor.
 * 2. Select retained frontend output.
 * 3. Read the next replay page.
 * 4. Check contiguity and decode each output.
 * 5. Return commands and the publication tip.
 */
export const getSelectedCommands = Effect.fn('FrontendServiceChain.getSelectedCommands')(
  function* (props: { db: IDb; afterServiceIndex: number }) {
    // 1 — require a nonnegative safe afterServiceIndex
    if (
      !Number.isSafeInteger(props.afterServiceIndex) ||
      props.afterServiceIndex < 0
    ) {
      return yield* new ZerospinError({
        code: 'frontend-replay-cursor-invalid',
        message: 'Replay requires a nonnegative service cursor',
      });
    }

    // 2 — read the retained selected-command table

    // 3 — select at most 64 ascending positions after the cursor
    const rows = props.db
      .select()
      .from(frontendServiceChainDbConfig.schema.commands)
      .where(
        gt(
          frontendServiceChainDbConfig.schema.commands.serviceIndex,
          props.afterServiceIndex,
        ),
      )
      .orderBy(asc(frontendServiceChainDbConfig.schema.commands.serviceIndex))
      .limit(64)
      .all();

    // 4 — reject skipped indices or malformed retained output bytes
    const commands = yield* Effect.forEach(rows, (row, i) =>
      Effect.gen(function* () {
        if (row.serviceIndex !== props.afterServiceIndex + i + 1) {
          return yield* new ZerospinError({
            code: 'frontend-replay-gap',
            message: 'Frontend replay has a gap',
          });
        }
        return yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(ServiceSelectedCommandSchema),
        )(row.output).pipe(
          mapParseError({
            code: 'frontend-replay-invalid',
            prefix: 'Invalid retained output',
          }),
        );
      }),
    );

    // 5 — read the whole-log maximum independently of the returned page
    return {
      commands,
      tip:
        props.db
          .select({
            index: frontendServiceChainDbConfig.schema.commands.serviceIndex,
          })
          .from(frontendServiceChainDbConfig.schema.commands)
          .orderBy(
            desc(frontendServiceChainDbConfig.schema.commands.serviceIndex),
          )
          .limit(1)
          .get()?.index ?? 0,
    };
  },
);
