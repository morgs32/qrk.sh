# Session database interfaces

Session state exposes two handles sharing one SQLite connection:

- `db` and `schema` retain encoded persistence values. Command execution, guards,
  replay, backup, and raw inspection use this interface.
- `queryDb` exposes model-only relational queries and the same `$client` for live
  notifications. `makeSessionQueryDb` creates fresh query columns whose JSON
  mappers decode through the field codec and encode predicate values through it.
  Storage columns are never modified. Selected columns and nested relations retain
  their inferred decoded types. Invalid JSON or schema values fail the query.

`useLiveQuery({ session, query })` passes `queryDb` to its query callback. Direct
reads use `session.store.getState().queryDb.query.<model>`. Raw SQL expressions
keep their explicitly declared result mapping; model codecs apply to model columns.

Aggregate, service, standalone, and both mock sessions publish `queryDb` with
`db` on initialization and clear both when releasing the database. The query
handle owns no separate connection or finalizer. It excludes mutation methods
and session metadata tables. Backups continue to store encoded values.
