import { primitives } from '@zerospin/schema';
import { drizzle } from 'drizzle-orm/sql-js';
import { Schema } from 'effect';
import initSqlJs from 'sql.js';
import { expect, it } from 'vitest';

import { makeResourceDbConfig } from '../../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { makeTableProvisioningStatements } from '../../drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';
import { defineModel } from '../defineModel.ts';
import { getGraph } from '../getGraph.ts';

import {
  captureActorSelections,
  makeActorDbVersion,
} from './makeActorDbVersion.ts';
import { makeModelVersion } from './makeModelVersion.ts';

it('encodes selected JSON rows after applying a decoded predicate', async () => {
  const item = makeModelVersion(
    defineModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      attributes: {
        payload: primitives.json({
          schema: Schema.Struct({ count: Schema.Number }),
        }),
      },
      indexes: [],
    },
  );
  const models = { item };
  const config = makeResourceDbConfig({ models });
  const SQL = await initSqlJs();
  const client = new SQL.Database();
  try {
    for (const table of Object.values(config.schema)) {
      for (const statement of makeTableProvisioningStatements(table)) {
        client.run(statement);
      }
    }
    const db = drizzle(client, { relations: config.relations });
    const now = new Date('2026-09-28T00:00:00.000Z');
    db.insert(config.schema.item)
      .values({
        id: 'itm_one',
        modelName: 'item',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        payload: '{"count":2}',
      })
      .run();
    const authoring = makeActorDbVersion({ models });
    const selections = captureActorSelections(
      authoring,
      {
        item: authoring.query.item.findMany({
          where: { payload: { eq: { count: 2 } } },
        }),
      },
      Schema.Struct({}),
    );
    expect(db.query.item.findFirst().sync()?.payload).toEqual({ count: 2 });
    expect(selections.item.all(db, {})).toEqual([
      expect.objectContaining({ payload: '{"count":2}' }),
    ]);
    expect(
      getGraph({ db, models, selections, identity: {} }).itm_one?.payload,
    ).toBe('{"count":2}');
  } finally {
    client.close();
  }
});
