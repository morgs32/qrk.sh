import { Effect } from 'effect';

/**
 * Test fixtures and assertion readbacks on fresh sync Drizzle DBs use direct `db` calls.
 *
 * @bad Wrap fixture seed inserts in `makeTx` when rollback is not behavior under test.
 * @bad Wrap assertion readbacks in `makeTx` just to call `.select().from(...).all()`.
 * @bad Add a helper solely to hide one test readback query; keep the direct query at the assertion site.
 */
export function seedFixtureAndReadAssertionRows(props: {
  db: {
    insert: (table: unknown) => {
      values: (row: Record<string, unknown>) => { run: () => void };
    };
    select: () => {
      from: (table: unknown) => { all: () => Array<{ id: string }> };
    };
  };
  now: Date;
  stagedCommands: unknown;
  users: unknown;
}) {
  const { db, now, stagedCommands, users } = props;

  db.insert(users)
    .values({
      id: 'usr_1',
      modelName: 'user',
      createdAt: now,
      updatedAt: now,
      version: 1,
      name: 'Ada',
    })
    .run();

  const stagedRows = db.select().from(stagedCommands).all();

  return stagedRows;
}

export function readRowsFromExistingEffectHelper(props: {
  db: {
    select: () => {
      from: (table: unknown) => { all: () => Array<{ id: string }> };
    };
  };
  failedCommands: unknown;
  executedCommands: unknown;
  pushedCommands: unknown;
  stagedCommands: unknown;
}) {
  const {
    db,
    failedCommands,
    executedCommands,
    pushedCommands,
    stagedCommands,
  } = props;

  return Effect.sync(() => {
    const stagedIds = db
      .select()
      .from(stagedCommands)
      .all()
      .map(row => row.id);
    const pushedIds = db
      .select()
      .from(pushedCommands)
      .all()
      .map(row => row.id);
    const executedIds = db
      .select()
      .from(executedCommands)
      .all()
      .map(row => row.id);
    const failedIds = db
      .select()
      .from(failedCommands)
      .all()
      .map(row => row.id);

    return { executedIds, failedIds, pushedIds, stagedIds };
  });
}
