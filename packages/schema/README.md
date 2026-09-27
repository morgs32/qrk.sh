# @zerospin/schema

Zerospin primitive descriptors, table definitions, and Effect Schema/Drizzle mappings.

```ts
import {
  makeDrizzleSchema,
  makeEffectSchema,
  makeTable,
  primitives,
} from '@zerospin/schema';
```

For tables declared together in `makeDbConfig`, use a named sibling reference:

```ts
primitives.ref({
  table: 'commands',
  column: 'rowId',
  relation: 'command',
  inverse: 'pending',
  nullable: true,
});
```

`table` names a key in the config's `tables` map; `column` must name that table's sole primary key. `makeDbConfig` checks both names, resolves references to the owned table objects, and infers the target's prefixed string or integer type, including nullability. Declaration order does not matter. Use the returned `config.tables` for codecs and row types. Reading a named-reference table's codec, encoding its shape, or generating SQL before resolution throws.

Object references (`primitives.ref({ table: model.table, relation, inverse })`) remain appropriate for separately authored model tables. Both forms produce the same relations and immediate SQL foreign keys; `primitives.self` retains its existing same-table behavior.
