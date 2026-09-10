import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { Effect, Equal, Schema } from 'effect';

import { SystemRepoDb, systemRepoDbConfig } from '../systemRepoDbConfig.js';

/** Accept the calling Worker's definitions atomically; removed versions remain locked. */
export const checkSystemSpec = Effect.fn('SystemRepo.checkSystemSpec')(
  function* (props: { db: IDb; spec: ISystemSpec }) {
    const spec = yield* Schema.decodeUnknownEffect(SystemSpecSchema)(
      props.spec,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'system-spec-invalid',
        prefix: 'SystemRepo received an invalid SystemSpec',
      }),
    );

    yield* makeTx(
      'SystemRepo.checkSystemSpec.transaction',
      SystemRepoDb,
    )(function* () {
      const tx = yield* SystemRepoDb.Tx;
      for (const { kind, definitions, table } of [
        {
          kind: 'aggregate',
          definitions: Object.values(spec.aggregates).flatMap(versions =>
            Object.values(versions),
          ),
          table: systemRepoDbConfig.schema.aggregateSpecLocks,
        },
        {
          kind: 'service',
          definitions: Object.values(spec.services).flatMap(versions =>
            Object.values(versions),
          ),
          table: systemRepoDbConfig.schema.serviceSpecLocks,
        },
      ]) {
        for (const definition of definitions) {
          const serialized = JSON.stringify(definition);
          const lock = tx
            .select()
            .from(table)
            .where(
              and(
                eq(table.name, definition.name),
                eq(table.version, definition.version),
              ),
            )
            .get();
          if (lock) {
            if (!Equal.equals(JSON.parse(lock.spec), JSON.parse(serialized))) {
              return yield* new ZerospinError({
                code: `${kind}-spec-mismatch`,
                message: `The ${kind} ${definition.name}@${definition.version} differs from its accepted spec`,
              });
            }
          } else {
            tx.insert(table)
              .values({
                name: definition.name,
                version: definition.version,
                spec: serialized,
              })
              .run();
          }
        }
      }
    })().pipe(Effect.provideService(SystemRepoDb, props.db));

    // HTTP version overrides do not prove which version currently owns this DO.
    return { workerVersionId: env.ZEROSPIN_VERSION_METADATA?.id ?? null };
  },
);
