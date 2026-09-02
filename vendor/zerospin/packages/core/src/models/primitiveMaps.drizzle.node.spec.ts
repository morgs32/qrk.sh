import {
  descriptorToEffectSchema,
  makeDrizzleSchemaFromTable,
  makeTable,
  primitives,
} from '@zerospin/schema';
import { sql } from 'drizzle-orm';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeInMemorySQLite3 } from '../drizzle/makeInMemorySQLite3.ts';
import { makeTableProvisioningSQL } from '../drizzle/makeTableProvisioningSQL.ts';
import { makeWaSqliteDrizzle } from '../drizzle/makeWaSqliteDrizzle.ts';

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

describe('primitives.json drizzle persistence', () => {
  it('round-trips IEncoded json as sqlite text without parsing on read', async () => {
    const claimsJsonWire = JSON.stringify({ x: 'ok' });
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, dbConfig);

    db.run(sql.raw(makeTableProvisioningSQL(apiKeyDrizzleSchema)));

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
