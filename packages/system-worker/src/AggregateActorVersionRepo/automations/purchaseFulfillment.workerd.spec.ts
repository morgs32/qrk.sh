import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import type { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import { aggregateChainFixedDORepoConfig } from '../../AggregateChain/aggregateChainFixedDORepoConfig.js';
import { serviceChainFixedDORepoConfig } from '../../ServiceChain/serviceChainFixedDORepoConfig.js';
import { serviceVersionRepoFixedDORepoConfig } from '../../ServiceVersionRepo/serviceVersionRepoFixedDORepoConfig.js';
import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo.js';
import { aggregateActorVersionRepoFixedDORepoConfig } from '../aggregateActorVersionRepoFixedDORepoConfig.js';

const decode = <A, E>(envelope: Parameters<typeof readRpcEnvelope<A, E>>[0]) =>
  Effect.runPromise(readRpcEnvelope(envelope));
const submit = (
  chain: Pick<AggregateChain, 'executeAggregateCommand'>,
  props: Parameters<AggregateChain['executeAggregateCommand']>[0],
): ReturnType<AggregateChain['executeAggregateCommand']> =>
  chain.executeAggregateCommand(props);
const inspect = (
  repo: Pick<AggregateActorVersionRepo, 'getRepoTableRows'>,
  props: Parameters<AggregateActorVersionRepo['getRepoTableRows']>[0],
): ReturnType<AggregateActorVersionRepo['getRepoTableRows']> =>
  repo.getRepoTableRows(props);

it('pays a purchase and persists manual packing and shipping outcomes', async () => {
  const aggregateId = 'acct_purchase_flow';
  const userId = 'usr_purchase_flow';
  const chain = env.AGGREGATE_CHAIN.getByName(
    await Effect.runPromise(
      aggregateChainFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        aggregateId,
        aggregateName: 'purchaseUser',
      }),
    ),
  );
  const actor = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        aggregateId,
        aggregateName: 'purchaseUser',
        aggregateVersion: '1.0.0',
        actorName: 'shopper',
        actorVersion: '1.0.0',
        actorPath: `/${aggregateId}/${userId}`,
      }),
    ),
  );
  const serviceRepo = async (serviceName: string) =>
    env.SERVICE_VERSION_REPO.getByName(
      await Effect.runPromise(
        serviceVersionRepoFixedDORepoConfig.nameUtils.makeName({
          systemId: env.ZEROSPIN_SYSTEM_ID,
          serviceName,
          serviceVersion: '1.0.0',
        }),
      ),
    );
  const catalog = await serviceRepo('catalog');
  const catalogChain = env.SERVICE_CHAIN.getByName(
    await Effect.runPromise(
      serviceChainFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'catalog',
      }),
    ),
  );
  await decode(
    await catalogChain.admitServiceCommand({
      command: {
        id: 'cmd_catalog_purchase_flow',
        commandName: 'createProduct',
        contractVersion: '1.0.0',
        payload: JSON.stringify({ id: 'prd_purchase_flow' }),
        serviceName: 'catalog',
        serviceVersion: '1.0.0',
      },
    }),
  );
  await decode(await catalog.flush(1));
  const products = await decode(
    await inspect(catalog, { tableName: 'product' }),
  );
  const command = async (
    id: `cmd_${string}`,
    commandName: string,
    payload: unknown,
    owner = userId,
  ) =>
    decode(
      await submit(chain, {
        aggregateVersion: '1.0.0',
        command: {
          systemName: 'system-worker',
          aggregateId,
          aggregateName: 'purchaseUser',
          aggregateVersion: '1.0.0',
          actorName: 'shopper',
          actorVersion: '1.0.0',
          identity: { aggregateId, userId: owner },
          id,
          commandName,
          contractVersion: '1.0.0',
          payload: JSON.stringify(payload),
          nodeId: null,
          nodeIndex: null,
          sessionName: null,
        },
      }),
    ).catch(error => {
      throw new Error(`${id}: ${JSON.stringify(error)}`);
    });
  expect(
    (
      await command('cmd_prepare_purchase_flow', 'prepareCart', {
        userId,
        cartId: 'crt_purchase_flow',
        cartItemId: 'cit_purchase_flow',
        product: JSON.stringify(products.rows[0]),
      })
    ).execution,
  ).toMatchObject({ status: 'succeeded' });
  const quote = {
    currency: 'usd',
    items: [
      {
        cartItemId: 'cit_purchase_flow',
        productId: 'prd_purchase_flow',
        name: 'Test',
        quantity: 1,
        unitAmount: 100,
      },
    ],
    subtotalAmount: 100,
    discountAmount: 0,
    promotionReservationId: null,
    totalAmount: 100,
  };
  expect(
    (
      await command('cmd_confirm_purchase_flow', 'confirmCheckout', {
        userId,
        id: 'chk_purchase_flow',
        cartId: 'crt_purchase_flow',
        purchaseId: 'pur_purchase_flow',
        paymentIntentId: 'pmt_purchase_flow',
        expected: null,
        quote: JSON.stringify(quote),
      })
    ).execution.status,
  ).toBe('succeeded');
  const rows = async (tableName: string) => {
    await decode(await actor.catchup());
    return (await decode(await inspect(actor, { tableName }))).rows;
  };
  await expect
    .poll(async () => (await rows('purchase'))[0]?.status, { timeout: 20000 })
    .toBe('paid');
  await expect
    .poll(async () => (await rows('fulfillment'))[0]?.status, {
      timeout: 20000,
    })
    .toBe('requested');
  const fulfillmentId = (await rows('fulfillment'))[0]?.id;
  expect(
    (
      await command(
        'cmd_pack_wrong_owner',
        'requestPacking',
        { id: 'fop_wrong_owner', fulfillmentId },
        'usr_other',
      )
    ).execution.status,
  ).toBe('failed');
  expect(
    (
      await command('cmd_ship_before_pack', 'requestShipping', {
        id: 'fop_premature',
        fulfillmentId,
      })
    ).execution.status,
  ).toBe('failed');
  expect(
    (
      await command('cmd_pack_purchase_flow', 'requestPacking', {
        id: 'fop_pack',
        fulfillmentId,
      })
    ).execution.status,
  ).toBe('succeeded');
  await expect
    .poll(
      async () =>
        (await rows('fulfillmentOperation')).find(row => row.id === 'fop_pack')
          ?.status,
      { timeout: 20000 },
    )
    .toBe('succeeded');
  await expect
    .poll(async () => (await rows('fulfillment'))[0]?.status, {
      timeout: 20000,
    })
    .toBe('packed');
  expect(
    (
      await command('cmd_pack_duplicate', 'requestPacking', {
        id: 'fop_pack',
        fulfillmentId,
      })
    ).execution.status,
  ).toBe('failed');
  expect(
    (
      await command('cmd_ship_purchase_flow', 'requestShipping', {
        id: 'fop_ship',
        fulfillmentId,
      })
    ).execution.status,
  ).toBe('succeeded');
  await expect
    .poll(
      async () =>
        (await rows('fulfillmentOperation')).find(row => row.id === 'fop_ship')
          ?.status,
      { timeout: 20000 },
    )
    .toBe('succeeded');
  await expect
    .poll(async () => (await rows('fulfillment'))[0]?.status, {
      timeout: 20000,
    })
    .toBe('shipped');
  expect((await rows('fulfillment'))[0]?.trackingId).toBe(
    `simulated_${fulfillmentId}`,
  );
  expect((await rows('purchase'))[0]?.status).toBe('paid');
  expect(await rows('fulfillmentOperation')).toMatchObject([
    { id: 'fop_pack', status: 'succeeded', failure: null },
    { id: 'fop_ship', status: 'succeeded', failure: null },
  ]);
});
