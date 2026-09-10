/*
 * System-worker annotation:
 * Registers one concrete Durable Object repo and its local SQLite tables.
 */

import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type {
  IRepoRegistration,
  ISystemSpec,
} from '@zerospin/core/system/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Equal, Schema } from 'effect';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

/*
 * Repo startup records its physical instance and table names in SystemRepo.
 * A repeated registration updates table metadata for the same repoType/repoName.
 *
 * 1. Require every bundled aggregate/service definition to be accepted.
 * 2. Upsert the physical Repo registration.
 */
export const registerRepo = Effect.fn('SystemRepo.registerRepo')(
  function* (props: {
    db: IDb | ITx;
    repoTable: IAnyDrizzleSchema & {
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
    registration: IRepoRegistration;
    spec: ISystemSpec;
  }) {
    const { db, registration, repoTable } = props;
    const spec = yield* Schema.decodeUnknownEffect(SystemSpecSchema)(
      props.spec,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'system-spec-invalid',
        prefix: 'Repo registration received an invalid SystemSpec',
      }),
    );

    // 1 — immutable locks make these reads safe before the single registration write
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
          return yield* new ZerospinError({
            code: `${kind}-spec-not-accepted`,
            message: `The ${kind} ${definition.name}@${definition.version} has no accepted spec`,
          });
        }
        if (
          !Equal.equals(
            JSON.parse(lock.spec),
            JSON.parse(JSON.stringify(definition)),
          )
        ) {
          return yield* new ZerospinError({
            code: `${kind}-spec-mismatch`,
            message: `The ${kind} ${definition.name}@${definition.version} differs from its accepted spec`,
          });
        }
      }
    }

    // 2 — JSON-encode tableNames and update only that field on a matching composite key
    db.insert(repoTable)
      .values({
        ...registration,
        tableNames: JSON.stringify(registration.tableNames),
      })
      .onConflictDoUpdate({
        target: [repoTable.repoType, repoTable.repoName],
        set: { tableNames: JSON.stringify(registration.tableNames) },
      })
      .run();
  },
);
