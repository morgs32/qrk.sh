import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { assertAcceptedSpec } from '../assertAcceptedSpec/assertAcceptedSpec.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

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

    yield* makeTx('SystemRepo.checkSystemSpec.transaction')(function* (
      tx: ITx<typeof systemRepoDbConfig>,
    ) {
      {
        const table = systemRepoDbConfig.schema.lockedAggregateActorVersions;
        const codec =
          systemRepoDbConfig.tables.lockedAggregateActorVersions.codec.fields
            .spec;
        for (const versions of Object.values(spec.aggregates)) {
          for (const aggregate of Object.values(versions)) {
            for (const actor of Object.values(aggregate.actors)) {
              const lock = tx
                .select()
                .from(table)
                .where(
                  and(
                    eq(table.aggregateName, aggregate.name),
                    eq(table.name, actor.name),
                    eq(table.version, actor.version),
                  ),
                )
                .get();
              if (lock) {
                const accepted = yield* Schema.decodeUnknownEffect(codec)(
                  lock.spec,
                ).pipe(
                  mapParseError({
                    code: 'system-spec-invalid',
                    prefix: 'Stored actor spec is invalid',
                  }),
                );
                yield* assertAcceptedSpec({
                  kind: 'actor',
                  name: `${aggregate.name}.${actor.name}`,
                  version: actor.version,
                  accepted,
                  incoming: actor,
                });
              } else {
                const serialized = yield* Schema.encodeUnknownEffect(codec)(
                  actor,
                ).pipe(
                  mapParseError({
                    code: 'system-spec-invalid',
                    prefix: 'Incoming actor spec cannot be stored',
                  }),
                );
                tx.insert(table)
                  .values({
                    aggregateName: aggregate.name,
                    name: actor.name,
                    version: actor.version,
                    spec: serialized,
                  })
                  .run();
              }
            }
          }
        }
      }
      {
        const table = systemRepoDbConfig.schema.lockedServiceActorVersions;
        const codec =
          systemRepoDbConfig.tables.lockedServiceActorVersions.codec.fields
            .spec;
        for (const versions of Object.values(spec.services)) {
          for (const service of Object.values(versions)) {
            for (const actor of Object.values(service.actors)) {
              const lock = tx
                .select()
                .from(table)
                .where(
                  and(
                    eq(table.serviceName, service.name),
                    eq(table.name, actor.name),
                    eq(table.version, actor.version),
                  ),
                )
                .get();
              if (lock) {
                const accepted = yield* Schema.decodeUnknownEffect(codec)(
                  lock.spec,
                ).pipe(
                  mapParseError({
                    code: 'system-spec-invalid',
                    prefix: 'Stored actor spec is invalid',
                  }),
                );
                yield* assertAcceptedSpec({
                  kind: 'service-actor',
                  name: `${service.name}.${actor.name}`,
                  version: actor.version,
                  accepted,
                  incoming: actor,
                });
              } else {
                const serialized = yield* Schema.encodeUnknownEffect(codec)(
                  actor,
                ).pipe(
                  mapParseError({
                    code: 'system-spec-invalid',
                    prefix: 'Incoming actor spec cannot be stored',
                  }),
                );
                tx.insert(table)
                  .values({
                    serviceName: service.name,
                    name: actor.name,
                    version: actor.version,
                    spec: serialized,
                  })
                  .run();
              }
            }
          }
        }
      }

      for (const { kind, definitions, table, codec } of [
        {
          kind: 'aggregate',
          definitions: Object.values(spec.aggregates).flatMap(versions =>
            Object.values(versions),
          ),
          table: systemRepoDbConfig.schema.lockedAggregateVersions,
          codec:
            systemRepoDbConfig.tables.lockedAggregateVersions.codec.fields.spec,
        },
        {
          kind: 'service',
          definitions: Object.values(spec.services).flatMap(versions =>
            Object.values(versions),
          ),
          table: systemRepoDbConfig.schema.lockedServiceVersions,
          codec:
            systemRepoDbConfig.tables.lockedServiceVersions.codec.fields.spec,
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
    })(props.db);

    // HTTP version overrides do not prove which version currently owns this DO.
    return { workerVersionId: env.ZEROSPIN_VERSION_METADATA?.id ?? null };
  },
);
