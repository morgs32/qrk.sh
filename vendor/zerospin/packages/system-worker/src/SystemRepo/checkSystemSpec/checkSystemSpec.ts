import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { mapParseError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { assertAcceptedSpec } from '../assertAcceptedSpec/assertAcceptedSpec.js';
import {
  SystemRepoDb,
  systemRepoDbConfig,
  systemRepoTables,
} from '../systemRepoDbConfig.js';

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
      for (const { kind, definitions, table, codec } of [
        {
          kind: 'aggregate',
          definitions: Object.values(spec.aggregates).flatMap(versions =>
            Object.values(versions),
          ),
          table: systemRepoDbConfig.schema.lockedAggregateVersions,
          codec: makeEffectSchema(
            systemRepoTables.lockedAggregateVersions.shape,
          ).fields.spec,
        },
        {
          kind: 'service',
          definitions: Object.values(spec.services).flatMap(versions =>
            Object.values(versions),
          ),
          table: systemRepoDbConfig.schema.lockedServiceVersions,
          codec: makeEffectSchema(systemRepoTables.lockedServiceVersions.shape)
            .fields.spec,
        },
      ]) {
        for (const definition of definitions) {
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
            const accepted = yield* Schema.decodeUnknownEffect(codec)(
              lock.spec,
            ).pipe(
              mapParseError({
                code: 'system-spec-invalid',
                prefix: 'Stored spec is invalid',
              }),
            );
            yield* assertAcceptedSpec({
              kind,
              name: definition.name,
              version: definition.version,
              accepted,
              incoming: definition,
            });
          } else {
            const serialized = yield* Schema.encodeUnknownEffect(codec)(
              definition,
            ).pipe(
              mapParseError({
                code: 'system-spec-invalid',
                prefix: 'Incoming spec cannot be stored',
              }),
            );
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
