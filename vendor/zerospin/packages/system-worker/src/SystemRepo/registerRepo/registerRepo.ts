/*
 * System-worker annotation:
 * Registers one concrete Durable Object repo and its local SQLite tables.
 */

import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type {
  IRepoRegistration,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { assertAcceptedSpec } from '../assertAcceptedSpec/assertAcceptedSpec.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/*
 * Repo startup records its physical instance and table names in SystemRepo.
 * A repeated registration updates table metadata for the same repoType/repoName.
 *
 * 1. Require every bundled aggregate/service definition to be accepted.
 * 2. Commit the physical Repo metadata and AggregateChain identity together.
 */
export const registerRepo = Effect.fn('SystemRepo.registerRepo')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    registration: IRepoRegistration;
    spec: ISystemSpec;
  }) {
    const { db, registration, spec: inputSpec } = props;
    const spec = yield* Schema.decodeUnknownEffect(SystemSpecSchema)(
      inputSpec,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'system-spec-invalid',
        prefix: 'Repo registration received an invalid SystemSpec',
      }),
    );

    // 1 — immutable locks make these reads safe before the registration transaction
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
        const lock = db
          .select()
          .from(table)
          .where(
            and(
              eq(table.name, definition.name),
              eq(table.version, definition.version),
            ),
          )
          .get();
        if (!lock) {
          return yield* Effect.fail(
            makeZerospinError({
              code: `${kind}-spec-not-accepted`,
              message: `The ${kind} ${definition.name}@${definition.version} has no accepted spec`,
            }),
          );
        }
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
      }
    }

    // 2 — both catalog writes commit together; repeated activation refreshes only table metadata
    yield* makeTx('SystemRepo.registerRepo.transaction')(function* (
      tx: ITx<typeof systemRepoDbConfig>,
    ) {
      tx.insert(systemRepoDbConfig.schema.repos)
        .values({
          repoType: registration.repoType,
          repoName: registration.repoName,
          tableNames: JSON.stringify(registration.tableNames),
        })
        .onConflictDoUpdate({
          target: [
            systemRepoDbConfig.schema.repos.repoType,
            systemRepoDbConfig.schema.repos.repoName,
          ],
          set: { tableNames: JSON.stringify(registration.tableNames) },
        })
        .run();

      if (registration.repoType === 'AggregateChain') {
        tx.insert(systemRepoDbConfig.schema.aggregates)
          .values({
            aggregateName: registration.aggregateName,
            aggregateId: registration.aggregateId,
          })
          .onConflictDoNothing()
          .run();
      }
    })(db);
  },
);
