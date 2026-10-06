/* oxlint-disable eslint/no-restricted-imports -- Workerd integration reads backend-owned table codecs without exposing private metadata as public APIs. */
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import type { IResult } from '@zerospin/error';
import { reset } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { getTableName } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import {
  AggregateChain,
  AggregateVersionRepo,
  ServiceChain,
  ServiceVersionRepo,
} from 'system-worker';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { SystemApi } from 'system-worker/SystemApi/SystemApi';

import { aggregateChainDbConfig } from '../../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig';
import { asyncOperationsDbConfig } from '../../../../packages/system-worker/src/asyncOperations/asyncOperationsDbConfig';
import { serviceChainDbConfig } from '../../../../packages/system-worker/src/ServiceChain/serviceChainDbConfig';
import { systemRepoDbConfig } from '../../../../packages/system-worker/src/SystemRepo/systemRepoDbConfig';
import { purchaseV1 } from '../../src/zerospin/aggregates/user/models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../../src/zerospin/aggregates/user/models/purchaseItem/PurchaseItemV1';
import { ClerkUserIdSchema } from '../../src/zerospin/claims';
import { addToCartV1 } from '../../src/zerospin/services/marketplace/contracts/addToCart/AddToCartV1';
import { cartItemV1 } from '../../src/zerospin/services/marketplace/models/cartItem/CartItemV1';
import { productV1 } from '../../src/zerospin/services/marketplace/models/product/ProductV1';
import config from '../../zerospin.config';

type ServiceRequest = Parameters<
  SystemApi['executeServiceCommand']
>[0]['args'][0];
type AggregateRequest = Parameters<
  SystemApi['executeAggregateCommand']
>[0]['args'][0];

const cleanupRepoNamespaces = [
  ['AggregateVersionRepo', env.AGGREGATE_VERSION_REPO],
  ['AggregateActorVersionRepo', env.AGGREGATE_ACTOR_VERSION_REPO],
  ['ServiceActorVersionRepo', env.SERVICE_ACTOR_VERSION_REPO],
  ['ServiceVersionRepo', env.SERVICE_VERSION_REPO],
  ['AggregateChain', env.AGGREGATE_CHAIN],
  ['AggregateVersionChain', env.AGGREGATE_VERSION_CHAIN],
  ['ServiceVersionChain', env.SERVICE_VERSION_CHAIN],
  ['AggregateActorVersionChain', env.AGGREGATE_ACTOR_VERSION_CHAIN],
  ['ServiceActorVersionChain', env.SERVICE_ACTOR_VERSION_CHAIN],
  ['ServiceChain', env.SERVICE_CHAIN],
  ['SystemLogRepo', env.SYSTEM_LOG_REPO],
] satisfies [
  string,
  {
    getByName(name: string): {
      ready(): Promise<unknown>;
    };
  },
][];

function unwrap<A, E>(envelope: { result: IResult<A, E> }): A {
  if (envelope.result._tag === 'Failure') throw envelope.result.failure;
  return envelope.result.success;
}

function cartIdentity(subject: string, amount: number) {
  return {
    subject: Schema.decodeUnknownSync(ClerkUserIdSchema)(subject),
    aggregateId: `acct_${subject}`,
    cartId: `crt_${subject}` as const,
    productId: `prd_${subject}` as const,
    cartItemId: `cit_${subject}` as const,
    purchaseId: `pur_${subject}` as const,
    amount,
    product: {
      id: `prd_${subject}` as const,
      name: 'Authoritative snapshot',
      description: 'Workerd integration product',
      price: 20,
    },
  };
}
type TestCart = ReturnType<typeof cartIdentity>;

/** Real timer bounds remain meaningful while recovery tests mock only Date. */
async function waitFor(
  check: () => boolean | Promise<boolean>,
  description: string,
) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (await check()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

export async function stopShoppingBackend() {
  try {
    // SystemRepo uses the exact systemId and does not register itself in its
    // catalog. Read that named singleton directly, including before setup.
    const catalog = unwrap(
      await env.SYSTEM_REPO.getByName(config.systemId).getRepoTableRows({
        tableName: getTableName(systemRepoDbConfig.schema.repos),
      }),
    );
    const registrations = Schema.decodeUnknownSync(
      Schema.Array(systemRepoDbConfig.tables.repos.codec),
    )(catalog.rows);
    // reset() clears live SQLite connections. Reopen names discarded by a
    // recovery abort before it deletes storage and discards instances.
    for (const registration of registrations) {
      const namespace = cleanupRepoNamespaces.find(
        ([repoType]) => repoType === registration.repoType,
      )?.[1];
      if (namespace === undefined) {
        throw new Error(
          `Cannot reset registered Shopping repo ${registration.repoType}:${registration.repoName}`,
        );
      }
      await namespace.getByName(registration.repoName).ready();
    }
    await env.SHOPPING_TEST_PROVIDER.getByName('shopping').status();
  } finally {
    await reset();
  }
}

export async function setupShoppingBackend() {
  await stopShoppingBackend();
  const api = await new GatewayApi({
    runtime: config.system.runtime,
  }).getSystemApi({
    zerospinSecretKey: 'sk_workerd',
  });
  if (!(api instanceof SystemApi)) {
    throw new Error('Shopping SystemApi admission failed');
  }
  unwrap(await api.checkSystemSpec({ traceContext: null, args: [] }));
  let commandIndex = 0;
  const commandId = () => `cmd_workerd_${++commandIndex}` as const;
  const caller = (subject: string) => ({
    actorName: 'shopper',
    actorVersion: '1.0.0',
    claims: {
      clerkUserId: Schema.decodeUnknownSync(ClerkUserIdSchema)(subject),
    },
    nodeId: null,
    nodeIndex: null,
    sessionName: null,
  });
  function serviceRequest(
    commandName: string,
    payload: string | object,
    subject: string | null,
  ): ServiceRequest {
    return {
      serviceVersion: '1.0.0',
      command: {
        id: commandId(),
        commandName,
        contractVersion: '1.0.0',
        serviceName: 'marketplace',
        serviceVersion: '1.0.0',
        payload:
          typeof payload === 'string' ? payload : JSON.stringify(payload),
        caller: subject === null ? null : caller(subject),
      },
    };
  }
  const checkout = async (request: ServiceRequest) =>
    unwrap(
      await api.executeServiceCommand({ traceContext: null, args: [request] }),
    );
  async function seedCart(options: { subject?: string; amount?: number } = {}) {
    const cart = cartIdentity(
      options.subject ?? 'user_alice',
      options.amount ?? 2,
    );
    for (const request of [
      serviceRequest('createProduct', cart.product, null),
      serviceRequest(
        'createCart',
        { id: cart.cartId, userId: cart.subject },
        cart.subject,
      ),
    ]) {
      const terminal = await checkout(request);
      if (terminal.execution.status !== 'succeeded') {
        throw new Error(`Cannot seed ${request.command.commandName}`);
      }
    }
    await addItem(cart, cart.cartItemId, cart.amount);
    return cart;
  }
  async function addItem(cart: TestCart, id: `cit_${string}`, amount: number) {
    const payload = await Effect.runPromise(
      encodePayload(addToCartV1, {
        version: '1.0.0',
        payload: {
          cartId: cart.cartId,
          cartItemId: id,
          amount,
          product: {
            ...cart.product,
            modelName: 'product',
            version: '1.0.0',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            name: 'Unchecked browser quote',
            price: 1,
          },
        },
      }),
    );
    const terminal = await checkout(
      serviceRequest('addToCart', payload, cart.subject),
    );
    if (terminal.execution.status !== 'succeeded') {
      throw new Error('Cannot seed cart item');
    }
    return id;
  }
  const aggregateName = (subject: string) =>
    Effect.runSync(
      AggregateVersionRepo.fixedDORepoConfig.nameUtils.makeName({
        systemId: config.systemId,
        aggregateId: `acct_${subject}`,
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
      }),
    );
  const marketplaceName = Effect.runSync(
    ServiceVersionRepo.fixedDORepoConfig.nameUtils.makeName({
      systemId: config.systemId,
      serviceName: 'marketplace',
      serviceVersion: '1.0.0',
    }),
  );
  async function userRows(subject = 'user_alice') {
    const repoName = aggregateName(subject);
    const registrations = unwrap(
      await api.getAggregateVersionRepos({ traceContext: null, args: [] }),
    );
    const read = async (tableName: string) =>
      registrations.some(row => row.repoName === repoName)
        ? unwrap(
            await api.getAggregateVersionRepoTableRows({
              traceContext: null,
              args: [{ repoName, tableName }],
            }),
          ).rows
        : [];
    const chainName = Effect.runSync(
      AggregateChain.fixedDORepoConfig.nameUtils.makeName({
        systemId: config.systemId,
        aggregateId: `acct_${subject}`,
        aggregateName: 'user',
      }),
    );
    const chains = unwrap(
      await api.getAggregateChains({ traceContext: null, args: [] }),
    );
    const commands = chains.some(row => row.repoName === chainName)
      ? unwrap(
          await api.getAggregateChainTableRows({
            traceContext: null,
            args: [
              {
                repoName: chainName,
                tableName: getTableName(aggregateChainDbConfig.schema.commands),
              },
            ],
          }),
        ).rows
      : [];
    return {
      purchases: Schema.decodeUnknownSync(Schema.Array(purchaseV1.table.codec))(
        await read(getTableName(purchaseV1.drizzleSchema)),
      ),
      items: Schema.decodeUnknownSync(Schema.Array(purchaseItemV1.table.codec))(
        await read(getTableName(purchaseItemV1.drizzleSchema)),
      ),
      work: Schema.decodeUnknownSync(
        Schema.Array(asyncOperationsDbConfig.tables.asyncOperations.codec),
      )(
        await read(
          getTableName(asyncOperationsDbConfig.schema.asyncOperations),
        ),
      ),
      commands: Schema.decodeUnknownSync(
        Schema.Array(aggregateChainDbConfig.tables.commands.codec),
      )(commands),
    };
  }
  async function marketplaceRows() {
    const read = async (tableName: string) =>
      unwrap(
        await api.getServiceVersionRepoTableRows({
          traceContext: null,
          args: [{ repoName: marketplaceName, tableName }],
        }),
      ).rows;
    const chainName = Effect.runSync(
      ServiceChain.fixedDORepoConfig.nameUtils.makeName({
        systemId: config.systemId,
        serviceName: 'marketplace',
      }),
    );
    return {
      products: Schema.decodeUnknownSync(Schema.Array(productV1.table.codec))(
        await read(getTableName(productV1.drizzleSchema)),
      ),
      cartItems: Schema.decodeUnknownSync(Schema.Array(cartItemV1.table.codec))(
        await read(getTableName(cartItemV1.drizzleSchema)),
      ),
      work: Schema.decodeUnknownSync(
        Schema.Array(asyncOperationsDbConfig.tables.asyncOperations.codec),
      )(
        await read(
          getTableName(asyncOperationsDbConfig.schema.asyncOperations),
        ),
      ),
      commands: Schema.decodeUnknownSync(
        Schema.Array(serviceChainDbConfig.tables.commands.codec),
      )(
        unwrap(
          await api.getServiceChainTableRows({
            traceContext: null,
            args: [
              {
                repoName: chainName,
                tableName: getTableName(serviceChainDbConfig.schema.commands),
              },
            ],
          }),
        ).rows,
      ),
    };
  }
  function makeTrackingCommand(
    commandName: 'createTrackingLabel' | 'updateTrackingInfo',
    purchaseId: `pur_${string}`,
    subject = 'user_alice',
  ): AggregateRequest {
    const aggregateId = `acct_${subject}`;
    return {
      aggregateVersion: '1.0.0',
      command: {
        id: commandId(),
        commandName,
        contractVersion: '1.0.0',
        systemName: 'shopping',
        aggregateName: 'user',
        aggregateId,
        aggregateVersion: '1.0.0',
        actorName: 'admin',
        actorVersion: '1.0.0',
        claims: { aggregateId },
        nodeId: null,
        nodeIndex: null,
        sessionName: null,
        payload: JSON.stringify({ purchaseId }),
      },
    };
  }
  const executeTracking = async (request: AggregateRequest) =>
    unwrap(
      await api.executeAggregateCommand({
        traceContext: null,
        args: [request],
      }),
    );
  type Purchase = Awaited<ReturnType<typeof userRows>>['purchases'][number];
  async function waitForPurchase(
    purchaseId: string,
    predicate: (row: Purchase) => boolean,
    subject = 'user_alice',
  ) {
    let found: Purchase | undefined;
    await waitFor(async () => {
      found = (await userRows(subject)).purchases.find(
        row => row.id === purchaseId && predicate(row),
      );
      return found !== undefined;
    }, `purchase ${purchaseId}`);
    if (found === undefined) {
      throw new Error('Purchase disappeared after readiness');
    }
    return found;
  }
  return {
    api,
    get provider() {
      return env.SHOPPING_TEST_PROVIDER.getByName('shopping');
    },
    seedCart,
    checkout,
    userRows,
    marketplaceRows,
    waitFor,
    waitForPurchase,
    makeCheckout: (
      cart: TestCart,
      options: { subject?: string; purchaseId?: `pur_${string}` } = {},
    ) =>
      serviceRequest(
        'checkout',
        {
          cartId: cart.cartId,
          purchaseId: options.purchaseId ?? cart.purchaseId,
        },
        options.subject ?? cart.subject,
      ),
    addLaterItem: (cart: TestCart, options: { amount?: number } = {}) =>
      addItem(cart, `cit_${cart.subject}_later`, options.amount ?? 3),
    makeTrackingCommand,
    executeTracking,
    track: (
      name: 'createTrackingLabel' | 'updateTrackingInfo',
      purchaseId: `pur_${string}`,
      subject = 'user_alice',
    ) => executeTracking(makeTrackingCommand(name, purchaseId, subject)),
    owner: (kind: 'marketplace' | 'user', subject = 'user_alice') =>
      kind === 'marketplace'
        ? env.SERVICE_VERSION_REPO.getByName(marketplaceName)
        : env.AGGREGATE_VERSION_REPO.getByName(aggregateName(subject)),
  };
}
