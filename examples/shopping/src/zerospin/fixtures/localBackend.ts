import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { config as loadEnv } from 'dotenv';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { checkoutIdentity } from '../../checkoutIdentity';
import { purchasesSession } from '../agents/purchasesSession';
import { addToCartV1 } from '../services/marketplace/contracts/addToCart/AddToCartV1';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });
const secret = process.env['ZEROSPIN_SECRET_KEY'];
assert.ok(secret, 'Local verification needs the server-side secret');
const apiUrl = process.env['ZEROSPIN_API_URL'] ?? 'http://127.0.0.1:3005';
assert.equal(
  new URL(apiUrl).hostname,
  '127.0.0.1',
  'Use disposable local storage',
);
const api = await Effect.runPromise(
  getApi<GatewayApi>(apiUrl)(gateway =>
    gateway.getSystemApi({ zerospinSecretKey: secret }),
  ),
);
const require = createRequire(import.meta.url);
const browserRequire = createRequire(require.resolve('@zerospin/browser'));
const { default: SQLiteFactory } = await import(
  browserRequire.resolve('@livestore/wa-sqlite/dist/wa-sqlite.mjs')
);
const wasmBinary = readFileSync(
  browserRequire.resolve('@livestore/wa-sqlite/dist/wa-sqlite.wasm'),
);
async function waitFor(
  check: () => boolean | Promise<boolean>,
  description: string,
) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
const product = {
  id: 'prd_runtime',
  name: 'Authoritative runtime product',
  description: 'Local command fixture',
  price: 20,
} as const;
const created = await Effect.runPromise(
  api.executeServiceCommand({
    serviceVersion: '1.0.0',
    command: {
      id: 'cmd_local_product',
      commandName: 'createProduct',
      contractVersion: '1.0.0',
      serviceName: 'marketplace',
      serviceVersion: '1.0.0',
      payload: JSON.stringify(product),
      caller: null,
    },
  }),
);
assert.equal(created.execution.status, 'succeeded');
for (const subject of ['user_runtime_alice', 'user_runtime_bob']) {
  const cartId = `crt_${subject}` as const;
  const aggregateId = `acct_${subject}` as const;
  const caller = {
    actorName: 'shopper',
    actorVersion: '1.0.0',
    claims: { clerkUserId: subject },
    nodeId: null,
    nodeIndex: null,
    sessionName: null,
  };
  async function execute(
    commandName: string,
    payload: unknown,
    suffix: string,
  ) {
    const terminal = await Effect.runPromise(
      api.executeServiceCommand({
        serviceVersion: '1.0.0',
        command: {
          id: `cmd_${subject}_${suffix}`,
          commandName,
          contractVersion: '1.0.0',
          serviceName: 'marketplace',
          serviceVersion: '1.0.0',
          payload:
            typeof payload === 'string' ? payload : JSON.stringify(payload),
          caller,
        },
      }),
    );
    assert.equal(
      terminal.execution.status,
      'succeeded',
      `${commandName} must succeed`,
    );
    return terminal;
  }
  await execute('createCart', { id: cartId, userId: subject }, 'cart');
  await execute(
    'addToCart',
    Effect.runSync(
      encodePayload(addToCartV1, {
        version: '1.0.0',
        payload: {
          cartId,
          cartItemId: `cit_${subject}`,
          amount: 2,
          product: {
            ...product,
            modelName: 'product',
            version: '1.0.0',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            price: 1,
            name: 'Unchecked browser quote',
          },
        },
      }),
    ),
    'item',
  );
  const identity = await checkoutIdentity(subject, 'local-runtime-checkout');
  const checkout = {
    serviceVersion: '1.0.0',
    command: {
      id: identity.commandId,
      commandName: 'checkout',
      contractVersion: '1.0.0',
      serviceName: 'marketplace',
      serviceVersion: '1.0.0',
      payload: JSON.stringify({ cartId, purchaseId: identity.purchaseId }),
      caller,
    },
  };
  const terminal = await Effect.runPromise(api.executeServiceCommand(checkout));
  assert.equal(terminal.execution.status, 'succeeded');
  const retried = await Effect.runPromise(api.executeServiceCommand(checkout));
  assert.deepEqual(
    retried,
    terminal,
    'Checkout retry returns the retained result',
  );
  await waitFor(
    async () =>
      (
        await Effect.runPromise(
          api.getAgentAggregateIds({
            aggregateName: 'user',
            aggregateVersion: '1.0.0',
          }),
        )
      ).includes(aggregateId),
    'registered user aggregate',
  );
  await purchasesSession.initialize({
    aggregateId,
    sqliteModuleFactory: () => SQLiteFactory({ wasmBinary }),
    bootstrap: async ({ nodeId }) => {
      const opened = await Effect.runPromise(
        api.openAgentSession({ agentName: 'purchases', aggregateId, nodeId }),
      );
      const socket = new URL('/ws-aggregate-session-commands', apiUrl);
      socket.protocol = 'ws:';
      socket.searchParams.set('ticket', opened.ticket);
      return JSON.parse(
        JSON.stringify({ ...opened, webSocketUrl: socket.toString() }),
      );
    },
  });
  try {
    await waitFor(
      () => purchasesSession.connection.getState().status === 'live',
      'admin socket replay',
    );
    const purchase = () =>
      purchasesSession.store
        .getState()
        .db?.query.purchase.findFirst({
          where: { id: { eq: identity.purchaseId } },
        })
        .sync();
    await waitFor(
      () => purchase()?.paymentState === 'paid',
      'durable transfer and payment',
    );
    assert.equal(
      purchase()?.total,
      40,
      'Price comes from authoritative marketplace',
    );
    assert.equal(
      purchasesSession.store.getState().db?.query.purchase.findMany().sync()
        ?.length,
      1,
      'Admin projection is isolated to its aggregate',
    );
    const items = purchasesSession.store
      .getState()
      .db?.query.purchaseItem.findMany()
      .sync();
    assert.equal(items?.length, 1);
    assert.equal(items?.[0]?.name, product.name);
    assert.equal(items?.[0]?.price, 20);
    function stage(contractName: 'createTrackingLabel' | 'updateTrackingInfo') {
      const result = stageCommand({
        session: purchasesSession,
        contractName,
        payload: { purchaseId: identity.purchaseId },
      });
      assert.equal(
        result._tag,
        'Success',
        `${contractName} must stage transactionally`,
      );
    }
    stage('createTrackingLabel');
    assert.equal(
      purchase()?.labelState,
      'requested',
      'Ordinary contract stages optimistically',
    );
    await waitFor(
      () => purchase()?.labelState === 'ready',
      'label authoritative stream',
    );
    assert.equal(purchase()?.trackingStatus, 'pre_transit');
    const label = purchase()?.labelReference;
    stage('createTrackingLabel');
    await waitFor(
      () => (purchasesSession.store.getState().executedIndex ?? 0) >= 5,
      'repeated label outcome',
    );
    assert.equal(purchase()?.labelReference, label);
    stage('updateTrackingInfo');
    await waitFor(
      () =>
        purchase()?.trackingStatus === 'in_transit' &&
        !purchase()?.trackingRefreshPending,
      'manual refresh one',
    );
    stage('updateTrackingInfo');
    await waitFor(
      () =>
        purchase()?.trackingStatus === 'delivered' &&
        !purchase()?.trackingRefreshPending,
      'manual refresh two',
    );
    console.log(
      `PASS ${aggregateId}: authoritative checkout USD 40, paid purchase, live staged label and two manual tracking pushes`,
    );
  } finally {
    await purchasesSession.dispose();
  }
}
assert.deepEqual(
  (
    await Effect.runPromise(
      api.getAgentAggregateIds({
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
      }),
    )
  ).sort(),
  ['acct_user_runtime_alice', 'acct_user_runtime_bob'],
);
console.log(
  'PASS local backend: two persisted user registrations and isolated paid purchases',
);
