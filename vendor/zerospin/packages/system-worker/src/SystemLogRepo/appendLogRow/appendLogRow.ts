/*
 * System-worker annotation:
 * Appends one SystemWorker log row, then trims old rows so SystemLogRepo stays
 * bounded as a dev/debug timeline.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type {
  ISystemLogLevel,
  ISystemLogRow,
} from '@zerospin/core/system/types';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { max, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import {
  systemLogRepoDrizzleSchemas,
  systemLogRowSchema,
} from '../SystemLogRepo.js';

const maxRows = 1000;

/*
 * 1. Validate the system identity.
 * 2. Allocate immutable row identity and time.
 * 3. Read the current system-local maximum index.
 * 4. Insert the next indexed row without yielding.
 * 5. Trim rows outside the newest 1,000 indexes.
 * 6. Return the authoritative inserted row.
 */
export const appendLogRow = Effect.fn('SystemLogRepo.appendLogRow')(
  function* (props: {
    db: IDb;
    deployId: string;
    generationId: string;
    level: ISystemLogLevel;
    message: string;
    payload: unknown | null;
    source: string;
    systemId: string;
  }): Effect.fn.Return<ISystemLogRow, IAnyError, Async | CuidFactory> {
    const { db, level, message, payload, source } = props;
    // 1 — SystemLogRepo rejects identities that do not carry their locked prefixes
    const systemId = yield* Schema.validate(
      makeAbbreviationIdSchema(cloudIdAbbreviations.systemRecord),
    )(props.systemId).pipe(
      mapParseError({
        code: 'failed-to-decode-log-row-system-id',
        prefix: 'Failed to decode SystemLogRepo systemId',
        extra: { systemId: props.systemId },
      }),
    );
    const generationId = yield* Schema.validate(
      makeAbbreviationIdSchema(cloudIdAbbreviations.generation),
    )(props.generationId).pipe(
      mapParseError({
        code: 'failed-to-decode-log-row-generation-id',
        prefix: 'Failed to decode SystemLogRepo generationId',
        extra: { generationId: props.generationId },
      }),
    );
    const deployId = yield* Schema.validate(
      makeAbbreviationIdSchema(cloudIdAbbreviations.deploy),
    )(props.deployId).pipe(
      mapParseError({
        code: 'failed-to-decode-log-row-deploy-id',
        prefix: 'Failed to decode SystemLogRepo deployId',
        extra: { deployId: props.deployId },
      }),
    );
    // 2 — identity and creation time remain independent from ordering
    const createdAt = yield* dutils.date();
    const id = yield* makeIdFromAbbreviation({ abbreviation: 'log' });
    const row = yield* makeAsync(() => {
      // 3 — each generation-scoped SystemLogRepo maintains its own monotonic sequence
      const [latestRow] = db
        .select({ logIndex: max(systemLogRepoDrizzleSchemas.logs.logIndex) })
        .from(systemLogRepoDrizzleSchemas.logs)
        .all();
      const logIndex = (latestRow?.logIndex ?? 0) + 1;
      const nextRow = {
        id,
        logIndex,
        createdAt,
        level,
        message,
        payload,
        source,
        systemId,
        generationId,
        deployId,
      } satisfies ISystemLogRow;

      // 4 — the max read and insert are synchronous so requests cannot interleave them
      db.insert(systemLogRepoDrizzleSchemas.logs)
        .values(Schema.encodeSync(systemLogRowSchema)(nextRow))
        .run();
      return Promise.resolve(nextRow);
    });
    // 5 — retention uses the same exclusive ordering key exposed to readers
    yield* makeAsync(() =>
      Promise.resolve(
        db.run(sql`
        DELETE FROM ${systemLogRepoDrizzleSchemas.logs}
        WHERE ${systemLogRepoDrizzleSchemas.logs.id} NOT IN (
          SELECT ${systemLogRepoDrizzleSchemas.logs.id}
          FROM ${systemLogRepoDrizzleSchemas.logs}
          ORDER BY ${systemLogRepoDrizzleSchemas.logs.logIndex} DESC
          LIMIT ${maxRows}
        )
      `),
      ),
    );

    // 6 — downstream Agent delivery receives the persisted id and index unchanged
    return row;
  },
);
