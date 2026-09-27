import { Effect } from 'effect';

/**
 * Test fixtures and assertion readbacks on fresh sync Drizzle DBs use direct `db` calls.
 *
 * @bad Wrap fixture seed inserts in `makeTx` when rollback is not behavior under test.
 * @bad Wrap assertion readbacks in `makeTx` just to call `.select().from(...).all()`.
 * @bad Add a helper solely to hide one test readback query; keep the direct query at the assertion site.
 */
export function seedFixtureAndReadAssertionRows(props: {
  activeCommands: unknown;
  db: {
    insert: (table: unknown) => {
      values: (row: Record<string, unknown>) => { run: () => void };
    };
    select: () => {
      from: (table: unknown) => { all: () => Array<{ id: string }> };
    };
  };
  now: Date;
  users: unknown;
}) {
  props.db
    .insert(props.users)
    .values({
      id: 'usr_1',
      modelName: 'user',
      createdAt: props.now,
      updatedAt: props.now,
      version: 1,
      name: 'Ada',
    })
    .run();

  return props.db.select().from(props.activeCommands).all();
}

export function readRowsFromExistingEffectHelper(props: {
  activeCommands: unknown;
  db: {
    select: () => {
      from: (table: unknown) => { all: () => Array<{ id: string }> };
    };
  };
}) {
  return Effect.sync(() =>
    props.db
      .select()
      .from(props.activeCommands)
      .all()
      .map(row => row.id),
  );
}
