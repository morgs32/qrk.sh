import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeTable } from './makeTable.ts';
import { makeDrizzleSchemaFromTable } from './primitiveMaps.ts';
import { primitives } from './primitives.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });
const claimsJson = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
});
const defaultClaimsJson = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: null,
});

const apiKeyTable = makeTable({
  name: 'apiKey',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'ak' }),
    claims: claimsJson,
    defaultClaims: defaultClaimsJson,
    enabled: primitives.boolean({ defaultValue: true }),
    useCount: primitives.integer({ defaultValue: 0 }),
    ratio: primitives.number({ defaultValue: 1.5 }),
    label: primitives.text({ defaultValue: 'ready' }),
    createdAt: primitives.date({ defaultValue: new Date(0) }),
    status: primitives.enum({
      values: ['ready', 'revoked'],
      defaultValue: 'ready',
    }),
  },
});

const apiKeyDrizzleSchema = makeDrizzleSchemaFromTable(apiKeyTable);

type Select = typeof apiKeyDrizzleSchema.$inferSelect;
type Insert = typeof apiKeyDrizzleSchema.$inferInsert;

/** Drizzle insert/select for primitives.json must use IEncoded (sqlite text), not decoded object. */
assert<Equals<Select['claims'], string | null>>();
assert<Equals<Insert['claims'], string | null | undefined>>();
assert<Equals<Select['defaultClaims'], string | null>>();
assert<Equals<Insert['defaultClaims'], string | null | undefined>>();
assert<Equals<Insert['id'], `ak_${string}`>>();
assert<Equals<Select['enabled'], boolean>>();
assert<Equals<Insert['enabled'], boolean | undefined>>();
assert<Equals<Select['useCount'], number>>();
assert<Equals<Insert['useCount'], number | undefined>>();
assert<Equals<Select['ratio'], number>>();
assert<Equals<Insert['ratio'], number | undefined>>();
assert<Equals<Select['label'], string>>();
assert<Equals<Insert['label'], string | undefined>>();
assert<Equals<Select['createdAt'], Date>>();
assert<Equals<Insert['createdAt'], Date | undefined>>();
assert<Equals<Select['status'], 'ready' | 'revoked'>>();
assert<Equals<Insert['status'], 'ready' | 'revoked' | undefined>>();
