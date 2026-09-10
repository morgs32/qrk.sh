import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
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
export const getCommands = Effect.fn('FrontendServiceChain.getCommands')(
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

    // 2 — read the versioned frontend deltas table

    // 3 — select at most 64 ascending positions after the cursor
    const rows = props.db
      .select()
      .from(frontendServiceChainDbConfig.schema.deltas)
      .where(
        gt(
          frontendServiceChainDbConfig.schema.deltas.serviceIndex,
          props.afterServiceIndex,
        ),
      )
      .orderBy(asc(frontendServiceChainDbConfig.schema.deltas.serviceIndex))
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
          Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
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
            index: frontendServiceChainDbConfig.schema.deltas.serviceIndex,
          })
          .from(frontendServiceChainDbConfig.schema.deltas)
          .orderBy(
            desc(frontendServiceChainDbConfig.schema.deltas.serviceIndex),
          )
          .limit(1)
          .get()?.index ?? 0,
    };
  },
);
