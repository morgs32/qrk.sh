import type {
  IContract,
  IRow,
  IRowChange,
  IRows,
  IScenario,
  IScenarioStep,
  ISource,
} from '../types';

const source = (path: string, line = 1, note?: string): ISource => ({
  path,
  line,
  ...(note ? { note } : {}),
});
const shopping = 'examples/shopping/src/zerospin/';
const worker = 'packages/system-worker/src/';
const fixture = source(
  'visualizer/src/data/scenarios.ts',
  1,
  'Illustrative purchase; deterministic fixtures, not live storage or a provider integration.',
);
const cartSource = source(
  shopping + 'services/marketplace/contracts/addToCart/AddToCartV1.ts',
  11,
);
const mappingSource = source(
  shopping + 'services/marketplace/contracts/addToCart/mappedAddToCartV1.ts',
  8,
);
const asyncSource = source(worker + 'asyncOperations/README.md', 1);
const time = '2026-10-02T15:00:00.000Z';
const later = '2026-10-02T15:00:01.000Z';
const recoveredAt = '2026-10-02T15:00:05.000Z';
const base = { version: '1.0.0', createdAt: time, updatedAt: time };
const alice = { clerkUserId: 'user_alice' };
const aggregateClaims = { ...alice, aggregateId: 'acct_user_alice' };
const product = {
  ...base,
  modelName: 'product',
  id: 'prd_one',
  name: 'Authoritative',
  description: 'Catalog description',
  price: 20,
};
const proposedProduct = {
  ...product,
  name: 'Client supplied',
  description: 'Client description',
  price: 1,
};
const cart = {
  ...base,
  modelName: 'cart',
  id: 'crt_alice',
  userId: 'user_alice',
};
const cartItem = {
  ...base,
  modelName: 'cartItem',
  id: 'cit_one',
  cartId: cart.id,
  productId: product.id,
  amount: 2,
};
const cartPayload = {
  cartId: cart.id,
  cartItemId: cartItem.id,
  product: proposedProduct,
  amount: 2,
};
const hash = (stream: string, index: number) =>
  'fixture:' + stream + ':' + index + ' (not cryptographic)';
const success = (result: unknown = null) => ({
  status: 'succeeded',
  contractVersion: '1.0.0',
  result,
  startedAt: time,
  completedAt: later,
});
const admission = { status: 'succeeded', startedAt: time, completedAt: time };
const change = (tableId: string, rows: readonly IRow[]): IRowChange => ({
  tableId,
  rows,
});
const changes = (rows: IRows): IRowChange[] =>
  Object.entries(rows).map(([tableId, value]) => change(tableId, value));
const without = (row: IRow, ...fields: string[]): IRow =>
  Object.fromEntries(
    Object.entries(row).filter(([name]) => !fields.includes(name)),
  );
const step = (
  value: Omit<IScenarioStep, 'source'> & { source?: ISource },
): IScenarioStep => ({ source: fixture, ...value });
const metadata = (
  ownerIndex = 0,
  executedIndex = 0,
  nextNodeIndex = 1,
  outcomeIndex = 0,
  stream = 'actor',
): IRow => ({
  id: 1,
  nodeId: 'nod_fixture',
  definitionKey: 'fixture:session-lock',
  initialized: true,
  nextNodeIndex,
  outcomeIndex,
  ownerIndex,
  executedIndex,
  executedHash: hash(stream, executedIndex),
  pushPaused: false,
});
const staged = {
  result: null,
  startedAt: time,
  completedAt: time,
  stagedDelta: { inserted: [], updated: [], deleted: [], operations: [] },
};
const ownedOperation = (
  commandId: string,
  operationIndex: number,
  modelName: string,
  resourceId: string,
  operationName: string,
  body: unknown,
  executedIndex?: number,
): IRow => ({
  commandId,
  operationIndex,
  modelName,
  modelVersion: '1.0.0',
  resourceId,
  operationName,
  body: JSON.stringify({ encodedAttributes: body }),
  committedAt: later,
  ...(executedIndex === undefined ? {} : { executedIndex }),
});

export const contracts: IContract[] = [
  {
    id: 'add-to-cart',
    name: 'addToCart',
    version: '1.0.0',
    role: 'Browser / original',
    source: cartSource,
    description:
      'Actual Shopping declaration. Browser stages the original contract and retains its null result.',
    payload: cartPayload,
    result: null,
    operations: [
      'create product when absent from the local selection',
      'create cartItem',
    ],
    program: [
      'guard: cart.userId === claims.clerkUserId',
      'if (!db.product.find(payload.product.id)) {',
      '  yield* models.product.create(payload.product.id, { name, description, price })',
      '}',
      'yield* models.cartItem.create(payload.cartItemId, { cartId, productId, amount })',
      'return null',
    ].join('\n'),
    mapping: 'mapped-add-to-cart',
  },
  {
    id: 'mapped-add-to-cart',
    name: 'addToCart',
    version: '1.0.0',
    role: 'Server mapping',
    source: mappingSource,
    description:
      'Registered on marketplace and shopper. Ordinary program runs first; mapper reads pre-application catalog state and emits no extra operations.',
    payload: cartPayload,
    result: null,
    operations: ['same collected base operations', 'no mapper operations'],
    program: [
      'const base = collect(addToCartV1) // operations are not applied yet',
      'if (!db.product.find(command.payload.product.id)) {',
      '  yield* failures.productNotFound.make({ message: "The catalog product no longer exists." })',
      '}',
      'return command.result // null from the original program',
    ].join('\n'),
    mapping: 'add-to-cart',
  },
  {
    id: 'purchase',
    name: 'purchase',
    version: '1.0.0',
    role: 'Illustrative browser / original',
    source: fixture,
    illustrative: true,
    description:
      'Proposed purchase in user@2.0.0, not a current Shopping command. A fixed trusted quote is supplied solely for this example.',
    payload: {
      purchaseId: 'pur_one',
      quoteId: 'quote_fixed_40_usd',
      items: [
        {
          id: 'pit_one',
          productId: 'prd_one',
          name: 'Basic T-Shirt',
          price: 20,
          quantity: 2,
        },
      ],
    },
    result: { purchaseId: 'pur_one' },
    operations: [
      'create purchase with payment-pending status',
      'create immutable purchaseItem snapshot',
    ],
    program: [
      'guard: quoteId identifies the fixed, trusted $40 USD fixture quote',
      'yield* models.purchase.create(purchaseId, { total: 40, currency: "USD", status: "payment-pending" })',
      'yield* models.purchaseItem.create(item.id, { purchaseId, productId, name, price, quantity })',
      'return { purchaseId }',
    ].join('\n'),
    mapping: 'mapped-purchase',
  },
  {
    id: 'mapped-purchase',
    name: 'purchase',
    version: '1.0.0',
    role: 'Illustrative server mapping',
    source: fixture,
    illustrative: true,
    description:
      'Registered identically on illustrative user aggregate and user actor@2.0.0. Uses the base result, not a query for an uncommitted purchase.',
    payload: { purchaseId: 'pur_one', quoteId: 'quote_fixed_40_usd' },
    result: { purchaseId: 'pur_one', paymentIntentId: 'pin_one' },
    operations: [
      'append private paymentIntent.create',
      'append asyncCompletePurchase({ paymentIntentId: "pin_one", amountMinor: 4000, currency: "USD" })',
    ],
    program: [
      'const purchaseId = command.result.purchaseId // collected base result',
      'const intent = { id: "pin_one", purchaseId, amountMinor: 4000, currency: "USD" }',
      'yield* operations.models.paymentIntent.create(intent.id, { ...intent, status: "pending", providerReference: null })',
      'yield* operations.contracts.asyncCompletePurchase({ paymentIntentId: intent.id, amountMinor: intent.amountMinor, currency: intent.currency })',
      'return { purchaseId, paymentIntentId: intent.id } // authoritative result stays server-side',
    ].join('\n'),
    mapping: 'purchase',
  },
  {
    id: 'async-complete-purchase',
    name: 'asyncCompletePurchase',
    version: '1.0.0',
    role: 'Illustrative external producer + private continuation',
    source: asyncSource,
    illustrative: true,
    description:
      'Contract body is illustrative; production, immutable evidence, recovery and child admission follow the current engine. Owner and AAVR confirmed replica store paymentIntent; the browser selection excludes it.',
    payload: { paymentIntentId: 'pin_one', amountMinor: 4000, currency: 'USD' },
    result: { purchaseId: 'pur_one', status: 'paid' },
    operations: [
      'external provider produces one observation',
      'private child updates paymentIntent and purchase synchronously',
    ],
    program: [
      'external.program({ payload }):',
      '  return Provider.collectOrReconcile({ idempotencyKey: payload.paymentIntentId, amountMinor: payload.amountMinor, currency: payload.currency })',
      '  // producer cannot query a live owner DB or emit model operations',
      'program({ payload, external, db, models }):',
      '  const intent = db.paymentIntent.find(payload.paymentIntentId)',
      '  yield* models.paymentIntent.update(intent.id, { status: external.status, providerReference: external.providerReference })',
      '  yield* models.purchase.update(intent.purchaseId, { status: external.status === "paid" ? "paid" : "payment-declined" })',
      '  return { purchaseId: intent.purchaseId, status: external.status }',
    ].join('\n'),
  },
];

function cartScenario(rejected: boolean): IScenario {
  const id = rejected ? 'cmd_cart_missing' : 'cmd_cart_one';
  const selectedProduct = rejected
    ? { ...proposedProduct, id: 'prd_missing' }
    : proposedProduct;
  const selectedItem = { ...cartItem, productId: selectedProduct.id };
  const payload = { ...cartPayload, product: selectedProduct };
  const caller = {
    actorName: 'shopper',
    actorVersion: '1.0.0',
    claims: alice,
    nodeId: 'nod_fixture',
    nodeIndex: 1,
    sessionName: 'shopperSession',
  };
  const nodeCommand = {
    id,
    nodeIndex: 1,
    commandName: 'addToCart',
    contractVersion: '1.0.0',
    payload: JSON.stringify(payload),
    targetId: 'marketplace',
    targetName: 'marketplace',
    actorName: caller.actorName,
    actorVersion: caller.actorVersion,
    claims: caller.claims,
    sessionName: caller.sessionName,
    staging: staged,
    ownerIndex: null,
    executedIndex: null,
    executedHash: null,
    actorDelta: null,
    failure: null,
  };
  const admitted = {
    id,
    commandName: 'addToCart',
    contractVersion: '1.0.0',
    payload: JSON.stringify(payload),
    serviceName: 'marketplace',
    serviceVersion: '1.0.0',
    caller,
    asyncInput: null,
    serviceIndex: 1,
    admission,
  };
  const failure = rejected
    ? {
        code: 'product-not-found',
        message: 'The catalog product no longer exists.',
        extra: null,
      }
    : null;
  const terminal = {
    ...admitted,
    execution: rejected
      ? { status: 'failed', startedAt: time, completedAt: later, failure }
      : success(),
    executedIndex: 1,
    executionVersion: '1.0.0',
    dispositionHash: hash('service', 1),
  };
  const operations = rejected
    ? []
    : [
        {
          ...ownedOperation(id, 0, 'cartItem', 'cit_one', 'create', {
            cartId: cart.id,
            productId: product.id,
            amount: 2,
          }),
          serviceIndex: 1,
        },
      ];
  const delta = { upserted: rejected ? [] : [product, cartItem], deleted: [] };
  const browserOutput = {
    executedIndex: 1,
    id,
    commandName: 'addToCart',
    caller,
    serviceIndex: 1,
    failure,
    delta,
    serviceHash: hash('service', 1),
    lastDeliveryFailure: null,
  };
  const initialRows: IRows = {
    'node/nodeMetadata': [metadata(0, 0, 1, 0, 'service')],
    'node/commands': [],
    'node/cart': [cart],
    'node/cartItem': [],
    'node/product': [],
    'session/cart': [cart],
    'session/cartItem': [],
    'session/product': [],
    'svr/cart': [cart],
    'svr/cartItem': [],
    'svr/product': [product],
    'svr/commands': [],
    'svr/modelOperations': [],
    'svr/asyncOperations': [],
    'svr/executedCommandOutbox': [],
    'sc/commands': [],
    'svc/commands': [],
    'svc/modelOperations': [],
    'savr/cart': [cart],
    'savr/cartItem': [],
    'savr/product': [],
    'savr/commands': [],
    'savr/browserCommandOutbox': [],
    'savc/browserCommands': [],
  };
  return {
    id: rejected ? 'cart-missing-product' : 'cart-success',
    name: rejected
      ? 'Add to cart · catalog rejection'
      : 'Add to cart · mapped contract',
    illustrative: false,
    description: rejected
      ? 'A locally predicted product disappeared from the authoritative catalog. Mapping rejects the entire owner transaction; the browser removes optimism.'
      : 'Actual Shopping service route. Local price $1 reconciles to authoritative $20; addToCart does not pass through AAVR.',
    initialRows,
    steps: [
      step({
        id: 'local-stage',
        title: 'Stage the original contract',
        description:
          'Original addToCart@1.0.0 predicts a missing selected product and cart item. Node durably accepts command 1 before stageServiceCommand resolves.',
        phase: 'local',
        focus: [
          'session',
          'node',
          'session/product',
          'session/cartItem',
          'node/commands',
        ],
        connections: ['command-local-service'],
        contractId: 'add-to-cart',
        source: source('packages/browser/src/bootstrapServiceSession.ts', 146),
        changes: changes({
          'session/product': [selectedProduct],
          'session/cartItem': [selectedItem],
          'node/commands': [nodeCommand],
          'node/nodeMetadata': [metadata(0, 0, 2, 0, 'service')],
        }),
        note: 'Service staging evidence has an empty stagedDelta in current source; optimism is derived from the original program. The Node stores the command; optimistic rows belong to the session view. Fixed timestamps and fixture hashes are display data.',
      }),
      step({
        id: 'socket-push',
        title: 'Send over the live service socket',
        description:
          'SharedWorker Node sends pushServiceCommand with pinned actor, session, claims and its stable command/node indexes.',
        phase: 'delivery',
        focus: ['node', 'service-socket', 'savc'],
        connections: ['command-service-socket', 'websocket-service-chain'],
        changes: [],
        source: source('packages/browser/src/Node/NodeSynchronization.ts', 300),
      }),
      step({
        id: 'chain-admission',
        title: 'Retain service admission',
        description:
          'ServiceActorVersionChain checks the socket capability; ServiceChain deduplicates and retains serviceIndex 1. Admission is not authoritative execution.',
        phase: 'transaction',
        focus: ['savc', 'sc', 'sc/commands', 'node/commands'],
        connections: ['command-service-admit'],
        changes: changes({
          'sc/commands': [admitted],
          'node/commands': [{ ...nodeCommand, ownerIndex: 1 }],
        }),
        source: source(
          worker + 'ServiceActorVersionChain/onMessage/pushServiceCommand.ts',
          14,
        ),
      }),
      step({
        id: 'mapping',
        title: 'Collect base output, then run the mapper',
        description: rejected
          ? 'The base collects creates, but the mapper queries pre-application state and cannot find prd_missing. No collected operation has been applied.'
          : 'Catalog already has prd_one, so the base collects only cartItem.create. Mapper checks the existing product and forwards the original null result.',
        phase: 'transaction',
        focus: ['sc', 'svr', 'svr/product'],
        connections: ['command-service-execute'],
        contractId: 'mapped-add-to-cart',
        changes: [],
        source: mappingSource,
        note: 'Mapper reads pre-application state. It neither canonicalizes payload attributes nor sees newly emitted product rows.',
      }),
      step({
        id: 'owner-commit',
        title: rejected
          ? 'Roll back business output; retain rejection'
          : 'Commit authoritative owner output',
        description: rejected
          ? 'Product and cart-item emissions roll back together. The failed terminal result, cursor and publication intent still commit atomically.'
          : 'Create the cart item while preserving catalog name/price. Model operations, terminal result, progress and publication intent commit in one transaction.',
        phase: 'transaction',
        focus: [
          'svr',
          'svr/cartItem',
          'svr/modelOperations',
          'svr/commands',
          'svr/executedCommandOutbox',
        ],
        connections: [],
        changes: changes({
          'svr/cartItem': rejected ? [] : [cartItem],
          'svr/modelOperations': operations,
          'svr/commands': [terminal],
          'svr/executedCommandOutbox': [
            {
              ...without(terminal, 'executionVersion'),
              ownerKind: 'service',
              originalExecutionVersion: '1.0.0',
              originalServiceIndex: 1,
              lastDeliveryFailure: null,
            },
          ],
          'svr/head': [
            {
              singletonId: 1,
              serviceIndex: 1,
              executedIndex: 1,
              dispositionHash: hash('service', 1),
            },
          ],
        }),
        source: source(
          worker + 'ServiceVersionRepo/executeCommands/executeCommandsTx.ts',
          1,
        ),
      }),
      step({
        id: 'publish-service',
        title: 'Retain version history before acknowledgement',
        description:
          'ServiceVersionChain retains the immutable command and complete ordered output. Its durable acknowledgement drains owner publication, command and model-operation material.',
        phase: 'delivery',
        focus: ['svr', 'svc', 'svc/commands'],
        connections: ['projection-service-publish'],
        changes: changes({
          'svc/commands': [terminal],
          'svc/modelOperations': operations,
          'svr/executedCommandOutbox': [],
          'svr/modelOperations': [],
          'svr/commands': [],
        }),
        source: source(
          worker + 'ServiceVersionRepo/readExecutedCommandsPage.ts',
          1,
        ),
      }),
      step({
        id: 'actor-project',
        title: 'Project the shopper’s selected graph',
        description: rejected
          ? 'An empty resource delta still advances the actor cursor and retains the private failure for this caller.'
          : 'Replay retained model operations without running programs. Relationship selection brings authoritative prd_one into Alice’s graph alongside her new item.',
        phase: 'transaction',
        focus: [
          'svc',
          'savr',
          'savr/product',
          'savr/cartItem',
          'savr/browserCommandOutbox',
        ],
        connections: ['projection-service-replay'],
        changes: changes({
          'savr/product': rejected ? [] : [product],
          'savr/cartItem': rejected ? [] : [cartItem],
          'savr/commands': [terminal],
          'savr/modelOperations': operations,
          'savr/browserCommandOutbox': [browserOutput],
          'savr/actorState': [
            {
              id: 1,
              executedIndex: 1,
              serviceIndex: 1,
              serviceHash: hash('service', 1),
              serviceVersion: '1.0.0',
            },
          ],
        }),
        source: source(
          worker + 'ServiceActorVersionRepo/execute/executeTx.ts',
          1,
        ),
      }),
      step({
        id: 'browser-history',
        title: 'Publish durable browser history',
        description:
          'The actor chain stores browserCommands before acknowledging the actor’s outbox. Reconnect can replay this retained position.',
        phase: 'delivery',
        focus: ['savr', 'savc', 'savc/browserCommands'],
        connections: ['projection-service-browser'],
        changes: changes({
          'savc/browserCommands': [browserOutput],
          'savr/browserCommandOutbox': [],
        }),
        source: source(
          worker +
            'ServiceActorVersionChain/receiveActorOutputs/receiveActorOutputs.ts',
          1,
        ),
      }),
      step({
        id: 'browser-reconcile',
        title: rejected
          ? 'Remove rejected local prediction'
          : 'Reconcile to authoritative product data',
        description: rejected
          ? 'serviceActorOutput resolves command 1. Node records failure; session replaces selected rows and drops rejected optimism without creating missing owner rows.'
          : 'serviceActorOutput resolves command 1. The session replaces local $1 product data with catalog $20 data and rebases any other unresolved commands.',
        phase: 'transaction',
        focus: [
          'service-socket',
          'node',
          'session',
          'session/product',
          'session/cartItem',
        ],
        connections: ['websocket-service-output', 'projection-service-session'],
        changes: changes({
          'node/product': rejected ? [] : [product],
          'node/cartItem': rejected ? [] : [cartItem],
          'session/product': rejected ? [] : [product],
          'session/cartItem': rejected ? [] : [cartItem],
          'node/commands': [
            {
              ...nodeCommand,
              ownerIndex: 1,
              executedIndex: 1,
              executedHash: hash('service', 1),
              actorDelta: delta,
              failure,
            },
          ],
          'node/nodeMetadata': [metadata(1, 1, 2, 1, 'service')],
        }),
        source: source(
          'packages/browser/src/replaceServiceProjectionTx.ts',
          16,
        ),
        note: 'Source-backed rows and lifecycle; execution in this visualizer is deterministic playback, not SDK execution.',
      }),
    ],
  };
}

const pendingPurchase = {
  ...base,
  modelName: 'purchase',
  id: 'pur_one',
  total: 40,
  currency: 'USD',
  status: 'payment-pending',
};
const purchaseItem = {
  ...base,
  modelName: 'purchaseItem',
  id: 'pit_one',
  purchaseId: 'pur_one',
  productId: 'prd_one',
  name: 'Basic T-Shirt',
  price: 20,
  quantity: 2,
};
const privateIntent = {
  ...base,
  modelName: 'paymentIntent',
  id: 'pin_one',
  purchaseId: 'pur_one',
  amountMinor: 4000,
  currency: 'USD',
  status: 'pending',
  providerReference: null,
};
const purchasePayload = {
  purchaseId: 'pur_one',
  quoteId: 'quote_fixed_40_usd',
  items: [
    {
      id: 'pit_one',
      productId: 'prd_one',
      name: 'Basic T-Shirt',
      price: 20,
      quantity: 2,
    },
  ],
};
const frozenPayload = {
  paymentIntentId: 'pin_one',
  amountMinor: 4000,
  currency: 'USD',
};

function purchaseScenario(
  variant: 'paid' | 'declined' | 'retry' | 'reconnect',
): IScenario {
  const declined = variant === 'declined';
  const retry = variant === 'retry';
  const reconnect = variant === 'reconnect';
  const parentId = 'cmd_purchase_01';
  const childId = 'cmd_complete_01';
  const aggregateContext = {
    aggregateName: 'user',
    aggregateId: 'acct_user_alice',
    aggregateVersion: '2.0.0',
    systemName: 'shopping',
    actorName: 'user',
    actorVersion: '2.0.0',
    claims: aggregateClaims,
  };
  const parent = {
    ...aggregateContext,
    id: parentId,
    commandName: 'purchase',
    contractVersion: '1.0.0',
    payload: JSON.stringify(purchasePayload),
    asyncInput: null,
    nodeId: 'nod_fixture',
    nodeIndex: 1,
    sessionName: 'purchaseSession',
  };
  const parentAdmission = {
    ...parent,
    aggregateIndex: 1,
    originalExecutionVersion: '2.0.0',
    admission,
  };
  const parentTerminal = {
    ...parentAdmission,
    execution: success({ purchaseId: 'pur_one', paymentIntentId: 'pin_one' }),
    dispositionHash: hash('aggregate', 1),
    executedIndex: 1,
    executionVersion: '2.0.0',
  };
  const parentOperations = [
    ownedOperation(
      parentId,
      0,
      'purchase',
      'pur_one',
      'create',
      { total: 40, currency: 'USD', status: 'payment-pending' },
      1,
    ),
    ownedOperation(
      parentId,
      1,
      'purchaseItem',
      'pit_one',
      'create',
      {
        purchaseId: 'pur_one',
        productId: 'prd_one',
        name: 'Basic T-Shirt',
        price: 20,
        quantity: 2,
      },
      1,
    ),
    ownedOperation(
      parentId,
      2,
      'paymentIntent',
      'pin_one',
      'create',
      {
        purchaseId: 'pur_one',
        amountMinor: 4000,
        currency: 'USD',
        status: 'pending',
        providerReference: null,
      },
      1,
    ),
  ];
  const preparedOperations = parentOperations
    .slice(0, 2)
    .map(row => without(row, 'committedAt', 'executedIndex'));
  const nodeParent = {
    id: parentId,
    commandName: 'purchase',
    contractVersion: '1.0.0',
    payload: parent.payload,
    targetId: 'acct_user_alice',
    targetName: 'user',
    actorName: 'user',
    actorVersion: '2.0.0',
    claims: aggregateClaims,
    sessionName: 'purchaseSession',
    nodeIndex: 1,
    staging: {
      ...staged,
      result: { purchaseId: 'pur_one' },
      stagedDelta: {
        inserted: [pendingPurchase, purchaseItem],
        updated: [],
        deleted: [],
        operations: preparedOperations.map(row => ({
          ...row,
          appliedAt: time,
          previousUpdatedAt: null,
          inverseOperation: 'null',
        })),
      },
    },
    ownerIndex: null,
    executedIndex: null,
    executedHash: null,
    actorDelta: null,
    failure: null,
  };
  const emission = {
    commandId: parentId,
    operationIndex: 3,
    asyncContractName: 'asyncCompletePurchase',
    asyncContractVersion: '1.0.0',
    payload: frozenPayload,
    committedAt: later,
    executedIndex: 1,
  };
  const asyncPending = {
    ...emission,
    systemName: 'shopping',
    asyncCommandId: childId,
    actorName: 'user',
    actorVersion: '2.0.0',
    claims: aggregateClaims,
    external: null,
    externalRecordedAt: null,
    nextRunAt: later,
    lastProducerFailure: null,
  };
  const observation = {
    status: declined ? 'declined' : 'paid',
    providerReference: declined
      ? 'provider_decline_fixture'
      : 'provider_charge_fixture',
    amountMinor: 4000,
    currency: 'USD',
  };
  const asyncRecorded = {
    ...asyncPending,
    external: observation,
    externalRecordedAt: retry ? recoveredAt : later,
    nextRunAt: null,
  };
  const finalStatus = declined ? 'payment-declined' : 'paid';
  const finalPurchase = {
    ...pendingPurchase,
    status: finalStatus,
    updatedAt: later,
  };
  const finalIntent = {
    ...privateIntent,
    status: observation.status,
    providerReference: observation.providerReference,
    updatedAt: later,
  };
  const childAdmission = {
    ...aggregateContext,
    id: childId,
    commandName: 'asyncCompletePurchase',
    contractVersion: '1.0.0',
    payload: JSON.stringify(frozenPayload),
    asyncInput: { sourceCommandId: parentId, external: observation },
    nodeId: null,
    nodeIndex: null,
    sessionName: null,
    aggregateIndex: 2,
    originalExecutionVersion: '2.0.0',
    admission,
  };
  const childTerminal = {
    ...childAdmission,
    execution: success({ purchaseId: 'pur_one', status: observation.status }),
    dispositionHash: hash('aggregate', 2),
    executedIndex: 2,
    executionVersion: '2.0.0',
  };
  const childOperations = [
    ownedOperation(
      childId,
      0,
      'paymentIntent',
      'pin_one',
      'update',
      {
        status: observation.status,
        providerReference: observation.providerReference,
      },
      2,
    ),
    ownedOperation(
      childId,
      1,
      'purchase',
      'pur_one',
      'update',
      { status: finalStatus },
      2,
    ),
  ];
  const parentDelta = {
    upserted: [pendingPurchase, purchaseItem],
    deleted: [],
  };
  const childDelta = { upserted: [finalPurchase], deleted: [] };
  const parentBrowser = {
    id: parentId,
    commandName: 'purchase',
    executedIndex: 1,
    aggregateIndex: 1,
    executedHash: hash('actor', 1),
    delta: parentDelta,
    failure: null,
    completionNodeId: 'nod_fixture',
    completionNodeIndex: 1,
    completionSessionName: 'purchaseSession',
    completionClaims: aggregateClaims,
    lastDeliveryFailure: null,
  };
  const childBrowser = {
    id: childId,
    commandName: 'asyncCompletePurchase',
    executedIndex: 2,
    aggregateIndex: 2,
    executedHash: hash('actor', 2),
    delta: childDelta,
    failure: null,
    completionNodeId: null,
    completionNodeIndex: null,
    completionSessionName: null,
    completionClaims: null,
    lastDeliveryFailure: null,
  };
  const completedNodeParent = {
    ...nodeParent,
    ownerIndex: 1,
    executedIndex: 1,
    executedHash: hash('actor', 1),
    actorDelta: parentDelta,
  };
  const head = (index: number) => ({
    singletonId: 1,
    aggregateIndex: index,
    executedIndex: index,
    dispositionHash: hash('aggregate', index),
  });
  const actorState = (index: number) => ({
    id: 1,
    aggregateIndex: index,
    executedIndex: index,
    executedHash: hash('actor', index),
    aggregateVersion: '2.0.0',
  });
  const acResult = (index: number, terminal: IRow) => ({
    aggregateIndex: index,
    executedIndex: index,
    executionVersion: '2.0.0',
    execution: terminal.execution,
    dispositionHash: hash('aggregate', index),
  });
  const initialRows: IRows = {
    'node/commands': [],
    'node/nodeMetadata': [metadata()],
    'node/purchase': [],
    'node/purchaseItem': [],
    'aggregate-session/purchase': [],
    'aggregate-session/purchaseItem': [],
    'aavr/purchase': [],
    'aavr/purchaseItem': [],
    'aavr/paymentIntent': [],
    'aavr/commands': [],
    'aavr/stagedCommands': [],
    'aavr/stagedAggregateCommandOutbox': [],
    'aavr/browserCommandOutbox': [],
    'ac/commands': [],
    'ac/results': [],
    'ac/modelOperations': [],
    'ac/asyncOperations': [],
    'avr/purchase': [],
    'avr/purchaseItem': [],
    'avr/paymentIntent': [],
    'avr/modelOperations': [],
    'avr/asyncOperations': [],
    'avr/executedCommandOutbox': [],
    'avr/executedAggregateCommandOutbox': [],
    'avr/asyncCommandOutbox': [],
    'avr/asyncCommandOutboxHead': [{ singletonId: 1, lastIndex: 0 }],
    'avc/aggregateCommands': [],
    'avc/modelOperations': [],
    'avc/asyncOperations': [],
    'aavc/browserCommands': [],
    'provider/attempts': [],
    'provider/charges': [],
  };
  const steps: IScenarioStep[] = [
    step({
      id: 'local-stage',
      title: 'Stage purchase in an aggregate session',
      description:
        'The original public contract predicts a payment-pending purchase and snapshot items. Durable Node acceptance resolves staging with { purchaseId }; private paymentIntent is absent from the browser.',
      phase: 'local',
      focus: ['aggregate-session', 'node', 'aggregate-session/purchase'],
      connections: ['command-local-aggregate'],
      contractId: 'purchase',
      changes: changes({
        'node/commands': [nodeParent],
        'node/nodeMetadata': [metadata(0, 0, 2)],
        'aggregate-session/purchase': [pendingPurchase],
        'aggregate-session/purchaseItem': [purchaseItem],
      }),
      note: 'Illustrative user@2.0.0 extends current read-only user@1.0.0. Total 40 USD corresponds to 4000 provider minor units; no live price or tax calculation.',
    }),
    step({
      id: 'socket-push',
      title: 'Send purchase over the aggregate socket',
      description:
        'Node sends pushAggregateCommand to AggregateActorVersionChain with exact user aggregate, actor, claims, session and node context.',
      phase: 'delivery',
      focus: ['node', 'aggregate-socket', 'aavc'],
      connections: ['command-aggregate-socket', 'websocket-aggregate-chain'],
      changes: [],
      source: source('packages/browser/src/Node/NodeSynchronization.ts', 300),
    }),
    step({
      id: 'actor-stage',
      title: 'AAVR durably stages actor work',
      description:
        'AAVR validates original staging/actor guards, retains the stable command and prepared operations, and queues its actor-owned admission outbox. Confirmed actor rows stay unchanged.',
      phase: 'transaction',
      focus: [
        'aavc',
        'aavr',
        'aavr/stagedCommands',
        'aavr/stagedAggregateCommandOutbox',
      ],
      connections: ['command-aggregate-stage'],
      changes: changes({
        'aavr/commands': [
          {
            rowId: 'row_purchase_fixture',
            ...parent,
            aggregateIndex: null,
            admission: null,
            execution: null,
            dispositionHash: null,
            executedIndex: null,
            executedHash: null,
          },
        ],
        'aavr/stagedCommands': [
          {
            stageIndex: 1,
            commandRowId: 'row_purchase_fixture',
            stagedAt: time,
            operations: preparedOperations,
            resolvedAt: null,
          },
        ],
        'aavr/stagedAggregateCommandOutbox': [
          {
            ...parent,
            stageIndex: 1,
            stagedAt: time,
            operations: preparedOperations,
            commandRowId: 'row_purchase_fixture',
            lastDeliveryFailure: null,
          },
        ],
      }),
      source: source(
        worker + 'AggregateActorVersionRepo/optimistic/stageActorCommands.ts',
        1,
      ),
    }),
    step({
      id: 'chain-admission',
      title: 'AC admits parent command 1',
      description:
        'AggregateChain assigns aggregateIndex 1. AAVR drains its admission outbox after the saved receipt; no async child or second aggregate index exists yet.',
      phase: 'transaction',
      focus: ['aavr', 'ac', 'ac/commands'],
      connections: ['command-aggregate-admit'],
      changes: changes({
        'ac/commands': [parentAdmission],
        'node/commands': [{ ...nodeParent, ownerIndex: 1 }],
        'aavr/commands': [
          {
            rowId: 'row_purchase_fixture',
            ...without(parentAdmission, 'originalExecutionVersion'),
            execution: null,
            dispositionHash: null,
            executedIndex: null,
            executedHash: null,
          },
        ],
        'aavr/stagedAggregateCommandOutbox': [],
      }),
      source: source(
        worker +
          'AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.ts',
        1,
      ),
    }),
    step({
      id: 'mapping',
      title: 'Append a private intent and async emission',
      description:
        'Collect ordinary purchase output first. Mapper uses command.result.purchaseId and the fixed quote to create private pin_one and emit frozen intent ID, amount and currency. It never queries a newly emitted purchase row.',
      phase: 'transaction',
      focus: ['ac', 'avr', 'avr/paymentIntent', 'avr/asyncOperations'],
      connections: ['command-aggregate-execute'],
      contractId: 'mapped-purchase',
      changes: [],
      note: 'Both ordinary and mapped programs complete synchronously against pre-application state. Exact mapping and async declarations are registered on owner and actor.',
    }),
    step({
      id: 'parent-commit',
      title: 'Atomically commit the parent and production authority',
      description:
        'Purchase, item, private intent, ordered model/async output, terminal success, both publication queues and progress commit together. Parent succeeded means payment is pending; external work has not run.',
      phase: 'transaction',
      focus: [
        'avr',
        'avr/purchase',
        'avr/paymentIntent',
        'avr/asyncOperations',
        'avr/executedCommandOutbox',
        'avr/executedAggregateCommandOutbox',
      ],
      connections: [],
      changes: changes({
        'avr/purchase': [pendingPurchase],
        'avr/purchaseItem': [purchaseItem],
        'avr/paymentIntent': [privateIntent],
        'avr/modelOperations': parentOperations,
        'avr/asyncOperations': [asyncPending],
        'avr/head': [head(1)],
        'avr/executedCommandOutbox': [
          { ...parentTerminal, lastDeliveryFailure: null },
        ],
        'avr/executedAggregateCommandOutbox': [
          { ...parentTerminal, lastDeliveryFailure: null },
        ],
      }),
      source: source(worker + 'asyncOperations/prepareAsyncOperation.ts', 13),
      note: 'Async emission index 3 follows model indexes 0–2. Stable child cmd_complete_01 is allocated now; pending production reserves no chain position.',
    }),
    step({
      id: 'parent-publish',
      title: 'Publish the parent on independent retained streams',
      description:
        'AVC retains complete version output; AC retains original terminal history. Both receivers acknowledge owner publication. Transport emissions omit production authority/lifecycle.',
      phase: 'delivery',
      focus: ['avr', 'avc', 'ac', 'avc/asyncOperations'],
      connections: ['projection-aggregate-publish'],
      changes: changes({
        'avc/aggregateCommands': [parentTerminal],
        'avc/modelOperations': parentOperations,
        'avc/asyncOperations': [emission],
        'ac/results': [acResult(1, parentTerminal)],
        'ac/modelOperations': parentOperations.map(row => ({
          ...without(row, 'executedIndex'),
          aggregateIndex: 1,
        })),
        'ac/asyncOperations': [
          { ...without(emission, 'executedIndex'), aggregateIndex: 1 },
        ],
        'avr/executedCommandOutbox': [],
        'avr/executedAggregateCommandOutbox': [],
        'avr/modelOperations': [],
      }),
      source: source(worker + 'AggregateVersionRepo/README.md', 1),
      note: 'Publication and async production are independent post-commit lanes; playback shows one valid ordering.',
    }),
    step({
      id: 'parent-project',
      title: 'AAVR publishes confirmed public purchase state',
      description:
        'Project retained model operations without programs or producers. The confirmed replica applies all owner model operations, including private intent. Purchase and item enter the selected graph; intent and provider observation do not. Resolve saved actor optimism.',
      phase: 'transaction',
      focus: ['avc', 'aavr', 'aavr/purchase', 'aavr/browserCommandOutbox'],
      connections: ['projection-aggregate-replay'],
      changes: changes({
        'aavr/purchase': [pendingPurchase],
        'aavr/purchaseItem': [purchaseItem],
        'aavr/paymentIntent': [privateIntent],
        'aavr/commands': [
          {
            rowId: 'row_purchase_fixture',
            ...without(
              parentTerminal,
              'originalExecutionVersion',
              'executionVersion',
            ),
            executedHash: hash('actor', 1),
          },
        ],
        'aavr/stagedCommands': [
          {
            stageIndex: 1,
            commandRowId: 'row_purchase_fixture',
            stagedAt: time,
            operations: preparedOperations,
            resolvedAt: later,
          },
        ],
        'aavr/actorState': [actorState(1)],
        'aavr/browserCommandOutbox': [parentBrowser],
      }),
      source: source(
        worker +
          'AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommandsTx.ts',
        1,
      ),
    }),
    step({
      id: 'parent-browser',
      title: 'Complete the parent’s browser command once',
      description:
        'Actor chain retains parent output; Node records its single completion. Browser sees payment-pending purchase and only the original staging result. This does not wait for provider payment.',
      phase: 'delivery',
      focus: ['aavr', 'aavc', 'aggregate-socket', 'node', 'aggregate-session'],
      connections: [
        'projection-aggregate-browser',
        'websocket-aggregate-output',
        'projection-aggregate-session',
      ],
      changes: changes({
        'aavc/browserCommands': [parentBrowser],
        'aavr/browserCommandOutbox': [],
        'node/commands': [completedNodeParent],
        'node/purchase': [pendingPurchase],
        'node/purchaseItem': [purchaseItem],
        'node/nodeMetadata': [metadata(1, 1, 2, 1)],
        'aggregate-session/purchase': [pendingPurchase],
        'aggregate-session/purchaseItem': [purchaseItem],
      }),
      source: source(
        worker + 'AggregateActorVersionChain/AggregateActorVersionChain.ts',
        1,
      ),
    }),
  ];
  if (reconnect) {
    steps.push(
      step({
        id: 'disconnect',
        title: 'Browser disconnects at executed cursor 1',
        description:
          'The browser keeps the payment-pending view. Owner production continues independently; reconnect will request retained history after cursor 1.',
        phase: 'delivery',
        focus: ['aggregate-socket', 'node', 'aggregate-session'],
        connections: [],
        changes: [],
        source: source('packages/browser/src/Node/NodeSynchronization.ts', 1),
      }),
    );
  }
  const firstAttempt = {
    attempt: 1,
    idempotencyKey: 'pin_one',
    amountMinor: 4000,
    currency: 'USD',
    result: retry ? 'response-lost' : observation.status,
  };
  const providerCharges = declined
    ? []
    : [
        {
          id: 'provider_charge_fixture',
          idempotencyKey: 'pin_one',
          amountMinor: 4000,
          currency: 'USD',
        },
      ];
  steps.push(
    step({
      id: 'provider-call',
      title: retry
        ? 'Provider charges, but response is lost'
        : declined
          ? 'Provider records a payment decline'
          : 'Provider records one payment',
      description: retry
        ? 'Remote payment succeeded, but no local observation was recorded. Producer failure retains a recovery deadline. Provider business idempotency protects the later reconciliation call.'
        : 'After owner commit, producer calls the illustrative provider with stable business idempotency key pin_one. It cannot mutate models or hold the owner transaction.',
      phase: 'external',
      focus: ['avr', 'provider', 'provider/attempts', 'provider/charges'],
      connections: ['async-provider'],
      contractId: 'async-complete-purchase',
      changes: changes({
        'provider/attempts': [firstAttempt],
        'provider/charges': providerCharges,
        ...(retry
          ? {
              'avr/asyncOperations': [
                {
                  ...asyncPending,
                  nextRunAt: recoveredAt,
                  lastProducerFailure: {
                    code: 'provider-response-lost',
                    message: 'Fixture response lost before recording.',
                    extra: null,
                  },
                },
              ],
            }
          : {}),
      }),
      source: asyncSource,
    }),
  );
  if (retry) {
    steps.push(
      step({
        id: 'provider-retry',
        title: 'Recover with a second call and one charge',
        description:
          'Alarm recovery resolves the retained exact actor/async pins. The provider reconciles the same frozen intent and returns the prior charge; two attempts produced one business charge.',
        phase: 'external',
        focus: [
          'avr/asyncOperations',
          'provider/attempts',
          'provider/charges',
          'provider',
        ],
        connections: ['async-provider'],
        changes: changes({
          'provider/attempts': [
            firstAttempt,
            {
              attempt: 2,
              idempotencyKey: 'pin_one',
              amountMinor: 4000,
              currency: 'USD',
              result: 'reconciled-existing-charge',
            },
          ],
          'provider/charges': providerCharges,
        }),
        source: source(worker + 'asyncOperations/makeAsyncOperations.ts', 250),
        note: 'A durable nextRunAt deadline schedules later recovery. It is not an attempt counter or fencing token.',
      }),
    );
  }
  steps.push(
    step({
      id: 'record-observation',
      title: 'Atomically record evidence and queue the child',
      description:
        'Freeze the encoded provider observation, recording timestamp, cleared deadline and minimal child outbox entry together. Retained async payload and child identity are unchanged.',
      phase: 'transaction',
      focus: [
        'provider',
        'avr',
        'avr/asyncOperations',
        'avr/asyncCommandOutbox',
      ],
      connections: ['async-observation'],
      changes: changes({
        'avr/asyncOperations': [asyncRecorded],
        'avr/asyncCommandOutbox': [
          {
            outboxIndex: 1,
            asyncCommandId: childId,
            lastDeliveryFailure: null,
          },
        ],
        'avr/asyncCommandOutboxHead': [{ singletonId: 1, lastIndex: 1 }],
      }),
      source: source(worker + 'asyncOperations/makeAsyncOperations.ts', 29),
      note: 'externalRecordedAt is the presence marker, including when a valid recorded observation is JSON null.',
    }),
    step({
      id: 'child-admission',
      title: 'Admit a distinct private continuation',
      description:
        'Reconstruct cmd_complete_01 from retained emission/evidence. AC allocates aggregateIndex 2. Claims and actor context remain pinned; nodeId, nodeIndex and sessionName are null. Public async invocation is forbidden.',
      phase: 'transaction',
      focus: ['avr/asyncCommandOutbox', 'ac', 'ac/commands'],
      connections: ['async-continuation'],
      changes: changes({
        'ac/commands': [parentAdmission, childAdmission],
        'avr/asyncCommandOutbox': [],
      }),
      source: source(
        worker + 'asyncOperations/readPreparedAsyncCommand.ts',
        119,
      ),
      note: 'Admission acknowledgement removes only the outbox entry. Async evidence and its monotonic outbox head survive; no second initiating Node occurrence is created.',
    }),
    step({
      id: 'child-commit',
      title: declined
        ? 'Commit a declined business state'
        : 'Commit payment completion',
      description:
        'The private synchronous continuation reads the intent and its immutable external input, then updates intent and purchase in one owner transaction. It never calls the provider.',
      phase: 'transaction',
      focus: ['ac', 'avr', 'avr/paymentIntent', 'avr/purchase'],
      connections: ['command-aggregate-execute'],
      contractId: 'async-complete-purchase',
      changes: changes({
        'avr/paymentIntent': [finalIntent],
        'avr/purchase': [finalPurchase],
        'avr/modelOperations': childOperations,
        'avr/head': [head(2)],
        'avr/executedCommandOutbox': [
          { ...childTerminal, lastDeliveryFailure: null },
        ],
        'avr/executedAggregateCommandOutbox': [
          { ...childTerminal, lastDeliveryFailure: null },
        ],
      }),
      source: source(
        worker + 'AggregateVersionRepo/executeCommands/executeCommandsTx.ts',
        1,
      ),
      note: declined
        ? 'A provider decline is a recorded business observation; this illustrative continuation succeeds while changing purchase to payment-declined.'
        : 'The parent remains its original successful payment-pending occurrence. Completion is child command 2.',
    }),
    step({
      id: 'child-publish',
      title: 'Retain child history and acknowledge publication',
      description:
        'AVC and AC durably retain child terminal output before owner publication queues drain. The initiating source publication can be gone while original async evidence remains recoverable.',
      phase: 'delivery',
      focus: ['avr', 'avc', 'ac', 'avr/asyncOperations'],
      connections: ['projection-aggregate-publish'],
      changes: changes({
        'avc/aggregateCommands': [parentTerminal, childTerminal],
        'avc/modelOperations': [...parentOperations, ...childOperations],
        'ac/results': [acResult(1, parentTerminal), acResult(2, childTerminal)],
        'ac/modelOperations': [
          ...parentOperations.map(row => ({
            ...without(row, 'executedIndex'),
            aggregateIndex: 1,
          })),
          ...childOperations.map(row => ({
            ...without(row, 'executedIndex'),
            aggregateIndex: 2,
          })),
        ],
        'avr/modelOperations': [],
        'avr/executedCommandOutbox': [],
        'avr/executedAggregateCommandOutbox': [],
      }),
      source: asyncSource,
    }),
    step({
      id: 'child-project',
      title: 'Project only the public purchase change',
      description:
        'AAVR materializes retained child operations and commits the changed selected purchase with its actor cursor and browser outbox. Private intent stays in the confirmed server replica; intent/evidence stays outside the selected graph.',
      phase: 'transaction',
      focus: ['avc', 'aavr', 'aavr/purchase', 'aavr/browserCommandOutbox'],
      connections: ['projection-aggregate-replay'],
      changes: changes({
        'aavr/purchase': [finalPurchase],
        'aavr/paymentIntent': [finalIntent],
        'aavr/commands': [
          {
            rowId: 'row_purchase_fixture',
            ...without(
              parentTerminal,
              'originalExecutionVersion',
              'executionVersion',
            ),
            executedHash: hash('actor', 1),
          },
          {
            rowId: 'row_complete_fixture',
            ...without(
              childTerminal,
              'originalExecutionVersion',
              'executionVersion',
            ),
            executedHash: hash('actor', 2),
          },
        ],
        'aavr/actorState': [actorState(2)],
        'aavr/browserCommandOutbox': [childBrowser],
      }),
      source: source(
        worker +
          'AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommandsTx.ts',
        1,
      ),
    }),
    step({
      id: 'child-browser-history',
      title: 'Retain child output before acknowledging AAVR',
      description:
        'Actor chain stores child browserCommands before the actor outbox drains. The child has no completion recipient and does not issue another parent-command completion.',
      phase: 'delivery',
      focus: ['aavr', 'aavc', 'aavc/browserCommands'],
      connections: ['projection-aggregate-browser'],
      changes: changes({
        'aavr/browserCommandOutbox': [],
        'aavc/browserCommands': [parentBrowser, childBrowser],
      }),
      source: source(
        worker + 'AggregateActorVersionChain/AggregateActorVersionChain.ts',
        1,
      ),
    }),
  );
  if (reconnect) {
    steps.push(
      step({
        id: 'reconnect-replay',
        title: 'Reconnect and replay retained actor output',
        description:
          'Node resumes the websocket with executedIndex 1 and its fixture checkpoint. Chain replays child output 2, without re-executing a contract or producing another provider call.',
        phase: 'replay',
        focus: ['aavc', 'aggregate-socket', 'node', 'aavc/browserCommands'],
        connections: ['websocket-aggregate-output'],
        changes: [],
        source: source('packages/browser/src/Node/NodeSynchronization.ts', 110),
        note: 'This is retained actor-history replay on reconnect. VersionRepo historical replay likewise never starts async producers; its immutable async emissions have null production lifecycle.',
      }),
    );
  }
  steps.push(
    step({
      id: 'final-browser',
      title: declined
        ? 'Browser displays payment declined'
        : 'Browser displays the paid purchase',
      description:
        'Node advances its confirmed actor cursor to 2 and session receives the purchase delta. Its command journal still contains only the parent, completed once at index 1. Private async inputs are never copied into it.',
      phase: 'transaction',
      focus: [
        'aggregate-socket',
        'node',
        'aggregate-session',
        'aggregate-session/purchase',
      ],
      connections: [
        'websocket-aggregate-output',
        'projection-aggregate-session',
      ],
      changes: changes({
        'node/purchase': [finalPurchase],
        'node/nodeMetadata': [metadata(2, 2, 2, 1)],
        'aggregate-session/purchase': [finalPurchase],
      }),
      source: source('packages/core/src/Node/Node.ts', 614),
      note: 'The provider tables, IDs, fixed quote and non-cryptographic hashes are deterministic visual fixtures. No network or payment requests occur.',
    }),
  );
  return {
    id: 'purchase-' + variant,
    name: {
      paid: 'Purchase · payment succeeds',
      declined: 'Purchase · payment declined',
      retry: 'Purchase · response-loss recovery',
      reconnect: 'Purchase · reconnect and replay',
    }[variant],
    description:
      'Illustrative user@2.0.0 purchase/paymentIntent/asyncCompletePurchase declarations on the current aggregate engine. ' +
      {
        paid: 'Parent succeeds pending; a separate private child commits payment.',
        declined:
          'Recorded decline changes business state without repeating the producer.',
        retry: 'Two provider attempts reconcile one charge and one child.',
        reconnect:
          'Disconnected browser catches up from retained actor history.',
      }[variant],
    illustrative: true,
    initialRows,
    steps,
  };
}

export const scenarios: IScenario[] = [
  cartScenario(false),
  cartScenario(true),
  purchaseScenario('paid'),
  purchaseScenario('declined'),
  purchaseScenario('retry'),
  purchaseScenario('reconnect'),
];
