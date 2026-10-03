import assert from 'node:assert/strict';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { Effect } from 'effect';

import { purchaseV1 } from '../aggregates/user/models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../aggregates/user/models/purchaseItem/PurchaseItemV1';
import { system } from '../system';

const agent = system.agents.purchaseItems;
assert.ok(agent);
assert.equal(agent.aggregate.name, 'user');
assert.equal(agent.aggregate.version, '1.0.0');
assert.equal(agent.actor.authentication, 'system');
assert.deepEqual(agent.actor.contracts, {});
assert.deepEqual(agent.query, {
  modelName: 'purchaseItem',
  where: { quantity: { gt: 0 } },
});
const manifest = makeSystemSpec({ system });
assert.equal(
  manifest.agents.purchaseItems?.models.purchaseItem?.version,
  '1.0.0',
);
assert.ok(
  manifest.agents.purchaseItems?.models.purchaseItem?.properties.quantity,
);
await Effect.runPromise(
  Effect.gen(function* () {
    const config = makeResourceDbConfig({
      models: { purchase: purchaseV1, purchaseItem: purchaseItemV1 },
      otherTables: {},
    });
    const db = yield* makeProvisionedInMemorySqljsDb({ dbConfig: config });
    const base = {
      version: '1.0.0' as const,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    db.insert(config.schema.purchase)
      .values({ ...base, id: 'pur_one', modelName: 'purchase', total: 40 })
      .run();
    db.insert(config.schema.purchaseItem)
      .values([
        {
          ...base,
          id: 'pit_visible',
          modelName: 'purchaseItem',
          purchaseId: 'pur_one',
          productId: 'prd_external',
          name: 'Snapshot name',
          price: 20,
          quantity: 2,
        },
        {
          ...base,
          id: 'pit_zero',
          modelName: 'purchaseItem',
          purchaseId: 'pur_one',
          productId: 'prd_deleted',
          name: 'Removed product',
          price: 30,
          quantity: 0,
        },
      ])
      .run();
    const rows = db.query.purchaseItem
      .findMany({ where: { quantity: { gt: 0 } }, with: { purchase: true } })
      .sync();
    assert.deepEqual(
      rows.map(row => row.id),
      ['pit_visible'],
    );
    assert.equal(rows[0]?.purchase.total, 40);
    assert.equal(rows[0]?.name, 'Snapshot name');
    assert.equal(rows[0]?.price, 20);
    assert.equal(
      db.query.purchase.findFirst({ with: { items: true } }).sync()?.items
        .length,
      2,
    );
    assert.throws(() =>
      db
        .insert(config.schema.purchaseItem)
        .values({
          ...base,
          id: 'pit_orphan',
          modelName: 'purchaseItem',
          purchaseId: 'pur_absent',
          productId: 'prd_external',
          name: 'Orphan',
          price: 20,
          quantity: 1,
        })
        .run(),
    );
  }).pipe(Effect.provide(AsyncLive)),
);
await system.runtime.dispose();
console.log(
  'Shopping purchase-item preview declaration, manifest, filtered rows and snapshot relations passed',
);
