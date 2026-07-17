import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeInMemorySQLite3 } from '../drizzle/makeInMemorySQLite3.ts';
import { makeTableMigrationSQL } from '../drizzle/makeTableMigrationSQL.ts';
import { makeWaSqliteDrizzle } from '../drizzle/makeWaSqliteDrizzle.ts';

import { makeTable } from './makeTable.ts';
import {
  descriptorToEffectSchema,
  makeDrizzleSchemaFromTable,
} from './primitiveMaps.ts';
import { primitives } from './primitives.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });
const claimsJson = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
});

const apiKeyTable = makeTable({
  name: 'apiKey',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'ak' }),
    claims: claimsJson,
  },
});

const apiKeyDrizzleSchema = makeDrizzleSchemaFromTable(apiKeyTable);
const dbConfig = makeDbConfig({ tables: { apiKey: apiKeyTable } });

const cursorDrizzleSchema = makeDrizzleSchemaFromTable(
  makeTable({
    name: 'cursorPrimaryKey',
    shape: {
      cursor: primitives.cursor({ abbreviation: 'cur' }),
    },
  }),
);

const textDrizzleSchema = makeDrizzleSchemaFromTable(
  makeTable({
    name: 'textPrimaryKey',
    shape: {
      version: primitives.text(),
    },
  }),
);

describe('primary-key drizzle metadata', () => {
  it('marks only dedicated primary-key descriptors as primary columns', () => {
    expect(getTableConfig(apiKeyDrizzleSchema).columns[0]).toMatchObject({
      name: 'id',
      notNull: true,
      primary: true,
    });
    expect(
      getTableConfig(cursorDrizzleSchema).columns[0],
    ).toMatchObject({
      name: 'cursor',
      notNull: true,
      primary: false,
    });
    expect(
      getTableConfig(textDrizzleSchema).columns[0],
    ).toMatchObject({
      name: 'version',
      notNull: true,
      primary: false,
    });
  });
});

describe('primitives.json drizzle persistence', () => {
  it('round-trips IEncoded json as sqlite text without parsing on read', async () => {
    const claimsJsonWire = JSON.stringify({ x: 'ok' });
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, dbConfig);

    db.run(sql.raw(makeTableMigrationSQL(apiKeyDrizzleSchema)));

    try {
      db.insert(apiKeyDrizzleSchema)
        .values({
          id: 'ak_test',
          claims: claimsJsonWire,
        })
        .run();

      const [row] = db.select().from(apiKeyDrizzleSchema).all();
      expect(row?.claims).toBe(claimsJsonWire);
      expect(typeof row?.claims).toBe('string');
      expect(
        Schema.decodeUnknownSync(descriptorToEffectSchema(claimsJson))(
          row!.claims,
        ),
      ).toEqual({ x: 'ok' });
    } finally {
      await client.sqlite3.close(client.db);
    }
  });
});
