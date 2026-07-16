declare function makeTable(props: { name: string; shape: unknown }): unknown;
declare function makeDrizzleSchemaFromTable(table: unknown): unknown;

/**
 * `*Table` for `makeTable` shape defs; `*DrizzleSchema` for Drizzle sqlite table bindings.
 *
 * @bad `const apiKeyTable = makeDrizzleSchemaFromTable(apiKeyTableDef)` — reuses `*Table` for the Drizzle layer.
 */
const apiKeyTable = makeTable({
  name: 'apiKey',
  shape: {
    id: { kind: 'text' },
    token: { kind: 'text' },
  },
});

const apiKeyDrizzleSchema = makeDrizzleSchemaFromTable(apiKeyTable);

declare const db: { insert(table: unknown): { values(row: unknown): unknown } };

db.insert(apiKeyDrizzleSchema).values({ id: 'ak_1', token: 'tok' });

export { apiKeyDrizzleSchema };
