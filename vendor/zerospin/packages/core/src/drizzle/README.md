# Database queries and persistence

Each aggregate, service, standalone, and mock session publishes one `db` and its
encoded `schema`. `db.query` and `tx.query` decode declared JSON columns for every
registered table, including internal command tables. Predicates on those columns
accept decoded values and use the column codec to encode SQLite parameters.
Selected columns and nested relations keep their inferred decoded types. Invalid
selected JSON fails the query. Raw SQL expressions require explicit mapping.

Explicit table operations use encoded SQLite values. `config.schema` and
`model.drizzleSchema` are the persistence tables; neither receives relational
JSON mappers. Use a table codec when writing a previously decoded full row:

```ts
const row = db.query.item.findFirst({ where: { id: 'itm_one' } }).sync();
if (row !== undefined) {
  const encoded = Effect.runSync(item.table.encodeRow(row));
  db.insert(item.drizzleSchema).values(encoded).onConflictDoUpdate({
    target: item.drizzleSchema.id,
    set: { payload: encoded.payload },
  }).run();
}
```

Inside `makeTx`, `tx.query` belongs to the active transaction. It sees preceding
writes and participates in the same commit or rollback:

```ts
const program = makeTx('example')(function* (tx) {
  tx.update(item.drizzleSchema).set({ payload: '{"count":2}' }).run();
  return tx.query.item.findFirst({ where: { id: 'itm_one' } }).sync();
});
const row = Effect.runSync(program(db));
```

`useLiveQuery({ session, query })` subscribes to this `db` and its `$client`.
Its callback type exposes model-only relational queries, without internal tables
or mutation methods. Guard parameters named `queryDb` likewise receive the
invocation database or transaction as a restricted query capability. Backups,
selection exports, and transport envelopes retain their encoded formats.
