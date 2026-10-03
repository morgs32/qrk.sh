import type { IConnection, IEntity, IRepo, ISource, ITable } from '../types';

import schemaSnapshot from './schema-snapshot.json';

const worker = 'packages/system-worker/src';
const shopping = 'examples/shopping/src/zerospin';
const fixture: ISource = {
  path: 'visualizer/src/data/scenarios.ts',
  note: 'Illustrative fixture; no Shopping contracts or runtime schemas are changed.',
};
const aggregateIdentity =
  'systemId=sys_shopping; aggregateName=user; aggregateId=acct_user_alice; aggregateVersion=2.0.0 (illustrative)';
const aggregateActorIdentity = `${aggregateIdentity}; actorName=user; actorVersion=2.0.0; actorPath=/user_alice`;
const serviceIdentity =
  'systemId=sys_shopping; serviceName=marketplace; serviceVersion=1.0.0';
const serviceActorIdentity = `${serviceIdentity}; actorName=shopper; actorVersion=1.0.0; actorPath=/user_alice`;

export const repos: readonly IRepo[] = [
  {
    id: 'system',
    name: 'SystemRepo',
    abbreviation: 'sysrepo',
    owner: 'system',
    repoType: 'SystemRepo',
    identity: 'systemId=sys_shopping',
    description:
      'Immutable authored definition locks, activated repo catalog, and single-use websocket tickets. Routes an upgraded connection to its exact actor chain.',
    source: { path: `${worker}/SystemRepo/SystemRepo.ts` },
    position: { x: 0, y: 2 },
  },
  {
    id: 'log',
    name: 'SystemLogRepo',
    abbreviation: 'syslogrepo',
    owner: 'system',
    repoType: 'SystemLogRepo',
    identity: 'systemId=sys_shopping',
    description:
      'Admission diagnostics and telemetry; it does not order business commands.',
    source: { path: `${worker}/SystemLogRepo/SystemLogRepo.ts` },
    position: { x: 1, y: 2 },
  },
  {
    id: 'ac',
    name: 'AggregateChain',
    abbreviation: 'ac',
    owner: 'user',
    repoType: 'AggregateChain',
    identity:
      'systemId=sys_shopping; aggregateName=user; aggregateId=acct_user_alice',
    description:
      'Complete aggregate input journal. Allocates aggregateIndex, records the original execution version, and retains original results before other versions replay.',
    source: { path: `${worker}/AggregateChain/AggregateChain.ts` },
    position: { x: 1, y: 0 },
  },
  {
    id: 'avr',
    name: 'AggregateVersionRepo',
    abbreviation: 'avr',
    owner: 'user',
    repoType: 'AggregateVersionRepo',
    identity: aggregateIdentity,
    description:
      'Authoritative version-owned resource database, terminal output, two independently acknowledged publication outboxes, and original async production.',
    source: { path: `${worker}/AggregateVersionRepo/AggregateVersionRepo.ts` },
    position: { x: 2, y: 0 },
  },
  {
    id: 'avc',
    name: 'AggregateVersionChain',
    abbreviation: 'avc',
    owner: 'user',
    repoType: 'AggregateVersionChain',
    identity: aggregateIdentity,
    description:
      'Retained terminal commands and owned outputs. Fans out immutable execution history to actor projections.',
    source: {
      path: `${worker}/AggregateVersionChain/AggregateVersionChain.ts`,
    },
    position: { x: 3, y: 0 },
  },
  {
    id: 'aavr',
    name: 'AggregateActorVersionRepo',
    abbreviation: 'aavr',
    owner: 'user',
    repoType: 'AggregateActorVersionRepo',
    identity: aggregateActorIdentity,
    description:
      'Confirmed owner-resource replica, selected actor graph, optimistic scratch staging, staged admission outbox, and browser publication outbox. Programs run in scratch for staging; confirmed history is replayed as operations.',
    source: {
      path: `${worker}/AggregateActorVersionRepo/AggregateActorVersionRepo.ts`,
    },
    position: { x: 4, y: 0 },
  },
  {
    id: 'aavc',
    name: 'AggregateActorVersionChain',
    abbreviation: 'aavc',
    owner: 'user',
    repoType: 'AggregateActorVersionChain',
    identity: aggregateActorIdentity,
    description:
      'Durable selected-output log and hibernating websockets. Stages commands through AAVR, retains outputs before broadcasting, and validates resume cursors and hashes.',
    source: {
      path: `${worker}/AggregateActorVersionChain/AggregateActorVersionChain.ts`,
    },
    position: { x: 5, y: 0 },
  },
  {
    id: 'sc',
    name: 'ServiceChain',
    abbreviation: 'sc',
    owner: 'marketplace',
    repoType: 'ServiceChain',
    identity: 'systemId=sys_shopping; serviceName=marketplace',
    description:
      'Complete service admission history. Allocates serviceIndex and fans out to authored service versions.',
    source: { path: `${worker}/ServiceChain/ServiceChain.ts` },
    position: { x: 1, y: 1 },
  },
  {
    id: 'svr',
    name: 'ServiceVersionRepo',
    abbreviation: 'svr',
    owner: 'marketplace',
    repoType: 'ServiceVersionRepo',
    identity: serviceIdentity,
    description:
      'Authoritative catalog, carts and items. Executes original and mapped contracts, applies operations atomically and publishes durable terminal history.',
    source: { path: `${worker}/ServiceVersionRepo/ServiceVersionRepo.ts` },
    position: { x: 2, y: 1 },
  },
  {
    id: 'svc',
    name: 'ServiceVersionChain',
    abbreviation: 'svc',
    owner: 'marketplace',
    repoType: 'ServiceVersionChain',
    identity: serviceIdentity,
    description:
      'Retains service command results and operation material; publishes executionResultsFanout to actor replicas.',
    source: { path: `${worker}/ServiceVersionChain/ServiceVersionChain.ts` },
    position: { x: 3, y: 1 },
  },
  {
    id: 'savr',
    name: 'ServiceActorVersionRepo',
    abbreviation: 'savr',
    owner: 'marketplace',
    repoType: 'ServiceActorVersionRepo',
    identity: serviceActorIdentity,
    description:
      'Replays all owner model operations into a confirmed replica, computes selected deltas and checkpoints actor progress atomically. Service admission has no AAVR-style server scratch stage.',
    source: {
      path: `${worker}/ServiceActorVersionRepo/ServiceActorVersionRepo.ts`,
    },
    position: { x: 4, y: 1 },
  },
  {
    id: 'savc',
    name: 'ServiceActorVersionChain',
    abbreviation: 'savc',
    owner: 'marketplace',
    repoType: 'ServiceActorVersionChain',
    identity: serviceActorIdentity,
    description:
      'Durable selected-output log and hibernating websocket connections. Browser commands go directly from this chain to ServiceChain.',
    source: {
      path: `${worker}/ServiceActorVersionChain/ServiceActorVersionChain.ts`,
    },
    position: { x: 5, y: 1 },
  },
  {
    id: 'node',
    name: 'Shared Worker Node',
    abbreviation: 'node',
    owner: 'browser',
    identity:
      'nodeId=nod_fixture; one durable database per bound session definition',
    description:
      'Durable browser command journal, offline delivery and confirmed resources. The shown model tables are the union of the separately bound marketplace and illustrative aggregate definitions.',
    source: { path: 'packages/core/src/Node/nodeTables.ts' },
    position: { x: 0, y: 0 },
  },
  {
    id: 'session',
    name: 'Shopper session database',
    abbreviation: 'session',
    owner: 'browser',
    identity:
      'sessionName=shopperSession; marketplace@1.0.0; shopper@1.0.0; clerkUserId=user_alice',
    description:
      'Memory database for selected resources and browser optimistic previews. Durable service command identity belongs to the separate Node journal.',
    source: { path: `${shopping}/shopperSession.ts` },
    position: { x: 0, y: 1 },
  },
  {
    id: 'aggregate-session',
    name: 'Purchase session database',
    abbreviation: 'session',
    owner: 'browser',
    identity:
      'sessionName=purchaseSession; user@2.0.0; user@2.0.0; aggregateId=acct_user_alice',
    description:
      'Illustrative public purchase session, selected purchase graph, local command journal and optimistic operations. Private paymentIntent is excluded.',
    source: {
      path: 'packages/core/src/aggregateSession/sessionRepoDbConfig.ts',
    },
    position: { x: 0, y: 3 },
    illustrative: true,
  },
  {
    id: 'catalog-session',
    name: 'Catalog session database',
    abbreviation: 'session',
    owner: 'browser',
    identity:
      'sessionName=catalogSession; marketplace@1.0.0; catalog@1.0.0; actorPath=/user_alice',
    description:
      'A separate current actor/session selects all products. Shopper removal can deselect a product without deleting the owner catalog or this selection.',
    source: { path: `${shopping}/catalogSession.ts` },
    position: { x: 1, y: 3 },
  },
  {
    id: 'current-user',
    name: 'Current user v1 resources',
    abbreviation: 'avr',
    owner: 'user',
    identity:
      'systemId=sys_shopping; aggregateId=acct_user_alice; aggregateName=user; aggregateVersion=1.0.0',
    description:
      'Exact current user aggregate model schemas. Current user and purchaseItemPreview actors expose no commands; the purchase walkthrough separately adds illustrative v2 behavior.',
    source: { path: `${shopping}/aggregates/user/userAggregateV1.ts` },
    position: { x: 2, y: 3 },
  },
  {
    id: 'promotion-svr',
    name: 'Promotion ServiceVersionRepo',
    abbreviation: 'svr',
    owner: 'promotion',
    repoType: 'ServiceVersionRepo',
    identity:
      'systemId=sys_shopping; serviceName=promotion; serviceVersion=1.0.0',
    description:
      'Independent promotion reservation ledger. Reserve, commit, release and redeem contracts belong to this service; current Shopping does not join it to a checkout operator.',
    source: { path: `${shopping}/services/promotion/promotionService.ts` },
    position: { x: 3, y: 3 },
  },
  {
    id: 'provider',
    name: 'Fake payment provider ledger',
    abbreviation: 'demo',
    owner: 'provider',
    identity: 'provider=DemoPay; idempotencyKey=paymentIntentId=pin_one',
    description:
      'Fixture counters show two call attempts and one payment after a lost response. Idempotency is the provider contract, not an exactly-once framework guarantee.',
    source: fixture,
    position: { x: 4, y: 3 },
    illustrative: true,
  },
];

type ISchemaTable = Pick<ITable, 'name' | 'columns' | 'source' | 'indexes'>;
function captureTables(
  repoId: string,
  declarations: readonly ISchemaTable[],
  description?: string,
): ITable[] {
  return declarations.map(table => ({
    ...table,
    id: `${repoId}/${table.name}`,
    repoId,
    ...(description ? { description } : {}),
  }));
}
const model = (name: string): ISchemaTable => {
  const found = schemaSnapshot.models.find(table => table.name === name);
  if (!found) throw new Error(`Missing captured model ${name}`);
  return found;
};
const marketplaceModels = ['product', 'cart', 'cartItem'].map(model);
const currentUserModels = ['purchase', 'purchaseItem'].map(model);
const purchase: ISchemaTable = {
  ...model('purchase'),
  columns: [
    ...model('purchase').columns,
    { name: 'status', type: 'payment-pending | paid | payment-declined' },
    { name: 'currency', type: 'text' },
  ],
  source: fixture,
};
const paymentIntent: ISchemaTable = {
  name: 'paymentIntent',
  source: fixture,
  columns: [
    { name: 'id', type: 'text', primaryKey: true, unique: true },
    { name: 'modelName', type: 'text' },
    { name: 'createdAt', type: 'timestamp_ms' },
    { name: 'updatedAt', type: 'timestamp_ms' },
    { name: 'version', type: 'text' },
    {
      name: 'purchaseId',
      type: 'text',
      reference: { table: 'purchase', column: 'id' },
    },
    { name: 'amountMinor', type: 'integer' },
    { name: 'currency', type: 'text' },
    { name: 'status', type: 'pending | paid | declined' },
    { name: 'providerReference', type: 'text', nullable: true },
  ],
};
const illustrativeUserModels = [purchase, model('purchaseItem'), paymentIntent];
const capturedProduction = [
  ...captureTables('system', schemaSnapshot.system),
  ...captureTables('log', schemaSnapshot.log),
  ...captureTables('ac', schemaSnapshot.ac),
  ...captureTables('avr', schemaSnapshot.avr),
  ...captureTables('avc', schemaSnapshot.avc),
  ...captureTables('aavr', schemaSnapshot.aavr),
  ...captureTables('aavc', schemaSnapshot.aavc),
  ...captureTables('sc', schemaSnapshot.sc),
  ...captureTables('svr', schemaSnapshot.svr),
  ...captureTables('svc', schemaSnapshot.svc),
  ...captureTables('savr', schemaSnapshot.savr),
  ...captureTables('savc', schemaSnapshot.savc),
];
export const tables: readonly ITable[] = [
  ...capturedProduction,
  ...['svr', 'savr', 'session'].flatMap(repoId =>
    captureTables(repoId, marketplaceModels),
  ),
  ...['avr', 'aavr'].flatMap(repoId =>
    captureTables(
      repoId,
      illustrativeUserModels,
      'Illustrative user@2.0.0 extension. Current v1 purchase has only total in addition to framework fields. paymentIntent remains private.',
    ).map(table => ({ ...table, illustrative: table.name !== 'purchaseItem' })),
  ),
  ...captureTables('aggregate-session', schemaSnapshot['aggregate-session']),
  ...captureTables(
    'aggregate-session',
    [purchase, model('purchaseItem')],
    'Illustrative public purchase selection; no paymentIntent table is exposed.',
  ).map(table => ({ ...table, illustrative: table.name === 'purchase' })),
  ...captureTables('session', schemaSnapshot.session),
  ...captureTables('node', schemaSnapshot.node),
  ...captureTables(
    'node',
    [...marketplaceModels, purchase, model('purchaseItem')],
    'Union of resources from separate Node definition databases.',
  ).map(table => ({ ...table, illustrative: table.name === 'purchase' })),
  ...captureTables('catalog-session', [
    ...schemaSnapshot.session,
    model('product'),
  ]),
  ...captureTables('current-user', currentUserModels),
  ...captureTables('promotion-svr', [
    ...schemaSnapshot.svr,
    model('promotionReservation'),
  ]),
  {
    id: 'provider/attempts',
    repoId: 'provider',
    name: 'attempts',
    source: fixture,
    illustrative: true,
    columns: [
      { name: 'attempt', type: 'integer', primaryKey: true },
      { name: 'idempotencyKey', type: 'text' },
      { name: 'amountMinor', type: 'integer' },
      { name: 'currency', type: 'text' },
      { name: 'result', type: 'text' },
    ],
  },
  {
    id: 'provider/charges',
    repoId: 'provider',
    name: 'charges',
    source: fixture,
    illustrative: true,
    columns: [
      { name: 'id', type: 'text', primaryKey: true },
      { name: 'idempotencyKey', type: 'text', unique: true },
      { name: 'amountMinor', type: 'integer' },
      { name: 'currency', type: 'text' },
    ],
  },
];

export const entities: readonly IEntity[] = [
  {
    id: 'service-socket',
    name: 'Service websocket',
    kind: 'socket',
    owner: 'marketplace',
    description:
      '/ws-service-session-commands; locked marketplace/shopper capability. Resume moves awaiting-resume → replaying → live.',
    source: {
      path: `${worker}/ServiceActorVersionChain/onMessage/onMessage.ts`,
    },
    position: { x: 0, y: 1 },
  },
  {
    id: 'aggregate-socket',
    name: 'Aggregate websocket',
    kind: 'socket',
    owner: 'user',
    description:
      'Locked aggregate/actor capability. Sends admission independently of terminal output; resumes with executedIndex, executedHash and nodeIndex.',
    source: {
      path: `${worker}/AggregateActorVersionChain/onMessage/onMessage.ts`,
    },
    position: { x: 0, y: 0 },
  },
  {
    id: 'service-access',
    name: 'ServiceAccessApi / ServiceSessionApi',
    kind: 'access',
    owner: 'marketplace',
    description:
      'Authenticate claims, authorize the authored session definition, capture its selected snapshot, and request a SystemRepo ticket.',
    source: { path: `${worker}/ServiceAccessApi/ServiceAccessApi.ts` },
    position: { x: 0, y: 1 },
  },
  {
    id: 'aggregate-access',
    name: 'AggregateAccessApi / AggregateSessionApi',
    kind: 'access',
    owner: 'user',
    description:
      'Resolve actor claims and exact aggregate identity, authorize definition, capture selected state and create websocket ticket.',
    source: { path: `${worker}/AggregateAccessApi/AggregateAccessApi.ts` },
    position: { x: 0, y: 0 },
  },
  {
    id: 'user',
    name: 'user aggregate@1.0.0',
    kind: 'owner',
    owner: 'user',
    description:
      'Current aggregate acct_user_alice owns purchase(total) and purchaseItem snapshots. user@1.0.0 actor has no commands.',
    source: { path: `${shopping}/aggregates/user/userAggregateV1.ts` },
    position: { x: 2, y: 0 },
  },
  {
    id: 'marketplace',
    name: 'marketplace service@1.0.0',
    kind: 'owner',
    owner: 'marketplace',
    description:
      'Owns product, cart and cartItem. Shopper and catalog are separate selection views of this owner.',
    source: {
      path: `${shopping}/services/marketplace/marketplaceServiceV1.ts`,
    },
    position: { x: 2, y: 1 },
  },
  {
    id: 'promotion',
    name: 'promotion service@1.0.0',
    kind: 'owner',
    owner: 'promotion',
    description:
      'Owns promotionReservation, with reserved/committed/released/redeemed/denied outcomes. No automatic purchase coordinator exists in current Shopping.',
    source: { path: `${shopping}/services/promotion/promotionService.ts` },
    position: { x: 3, y: 3 },
  },
  {
    id: 'shopper-actor',
    name: 'shopper actor@1.0.0',
    kind: 'actor',
    owner: 'marketplace',
    description:
      'Clerk authentication; actorPath=/user_alice. Selects Alice cart, items, and referenced products; does not own the catalog.',
    source: {
      path: `${shopping}/services/marketplace/actors/shopperActorV1.ts`,
    },
    position: { x: 4, y: 1 },
  },
  {
    id: 'catalog-actor',
    name: 'catalog actor@1.0.0',
    kind: 'actor',
    owner: 'marketplace',
    description:
      'Clerk authentication; actorPath=/user_alice. Selects all products, with no public commands.',
    source: {
      path: `${shopping}/services/marketplace/actors/catalogActorV1.ts`,
    },
    position: { x: 4, y: 2 },
  },
  {
    id: 'user-actor',
    name: 'user actor@1.0.0',
    kind: 'actor',
    owner: 'user',
    description:
      'Claims pin aggregateId to the Clerk subject. Selects purchase and purchaseItem; contracts are currently empty.',
    source: { path: `${shopping}/aggregates/user/actors/userActorV1.ts` },
    position: { x: 4, y: 0 },
  },
  {
    id: 'preview-actor',
    name: 'purchaseItemPreview actor@1.0.0',
    kind: 'actor',
    owner: 'user',
    description:
      'System-authenticated actor with actorPath=/ and claims { aggregateId }; no commands.',
    source: {
      path: `${shopping}/aggregates/user/actors/purchaseItemPreviewV1.ts`,
    },
    position: { x: 4, y: 2 },
  },
  {
    id: 'agent',
    name: 'purchaseItems agent',
    kind: 'agent',
    owner: 'user',
    description:
      'Current system agent reads purchaseItemPreview resources filtered by purchaseItem.quantity > 0.',
    source: { path: `${shopping}/system.ts`, line: 11 },
    position: { x: 5, y: 2 },
  },
  {
    id: 'contract-add',
    name: 'addToCart@1.0.0',
    kind: 'contract',
    owner: 'marketplace',
    contractId: 'add-to-cart',
    description:
      'Original public contract creates a product when absent from browser selection and creates cartItem.',
    source: {
      path: `${shopping}/services/marketplace/contracts/addToCart/AddToCartV1.ts`,
    },
    position: { x: 1, y: 1 },
  },
  {
    id: 'contract-mapped-add',
    name: 'mapped addToCart@1.0.0',
    kind: 'contract',
    owner: 'marketplace',
    contractId: 'mapped-add-to-cart',
    description:
      'Server mapper requires the authoritative catalog product. It emits no extra operations; original contract name/version remain unchanged.',
    source: {
      path: `${shopping}/services/marketplace/contracts/addToCart/mappedAddToCartV1.ts`,
    },
    position: { x: 2, y: 1 },
  },
  {
    id: 'contract-purchase',
    name: 'purchase@1.0.0 · illustrative',
    kind: 'contract',
    owner: 'user',
    contractId: 'purchase',
    description:
      'Public fixture contract creates payment-pending purchase. It does not call the provider.',
    source: fixture,
    illustrative: true,
    position: { x: 1, y: 0 },
  },
  {
    id: 'contract-mapped-purchase',
    name: 'mapped purchase@1.0.0 · illustrative',
    kind: 'contract',
    owner: 'user',
    contractId: 'mapped-purchase',
    description:
      'Appends private paymentIntent creation and asyncCompletePurchase emission after original model operations.',
    source: fixture,
    illustrative: true,
    position: { x: 2, y: 0 },
  },
  {
    id: 'contract-async',
    name: 'asyncCompletePurchase@1.0.0 · illustrative',
    kind: 'contract',
    owner: 'user',
    contractId: 'async-complete-purchase',
    description:
      'Owner runs external producer, records its result and admits a distinct private child command. The synchronous child commits observed payment outcome.',
    source: fixture,
    illustrative: true,
    position: { x: 3, y: 0 },
  },
];

const routes: readonly IConnection[] = [
  {
    id: 'command-local-service',
    source: 'session',
    destination: 'node',
    kind: 'command',
    label: 'durable Node acceptance',
  },
  {
    id: 'command-service-socket',
    source: 'node',
    destination: 'service-socket',
    kind: 'command',
    label: 'pushServiceCommand',
  },
  {
    id: 'websocket-service-chain',
    source: 'service-socket',
    destination: 'savc',
    kind: 'websocket',
    label: 'live capability',
  },
  {
    id: 'command-service-admit',
    source: 'savc',
    destination: 'sc',
    kind: 'command',
    label: 'admitServiceCommand',
  },
  {
    id: 'command-service-execute',
    source: 'sc',
    destination: 'svr',
    kind: 'command',
    label: 'admissionResultsFanout',
  },
  {
    id: 'projection-service-publish',
    source: 'svr',
    destination: 'svc',
    kind: 'projection',
    label: 'executedCommandOutbox → durable history',
  },
  {
    id: 'projection-service-replay',
    source: 'svc',
    destination: 'savr',
    kind: 'projection',
    label: 'executionResultsFanout',
  },
  {
    id: 'projection-service-browser',
    source: 'savr',
    destination: 'savc',
    kind: 'projection',
    label: 'browserCommandOutbox',
  },
  {
    id: 'websocket-service-output',
    source: 'service-socket',
    destination: 'node',
    kind: 'websocket',
    label: 'serviceActorOutput / replay',
  },
  {
    id: 'websocket-service-broadcast',
    source: 'savc',
    destination: 'service-socket',
    kind: 'websocket',
    label: 'retained before broadcast',
  },
  {
    id: 'projection-service-session',
    source: 'node',
    destination: 'session',
    kind: 'projection',
    label: 'confirmed delta + optimistic rebase',
  },
  {
    id: 'command-local-aggregate',
    source: 'aggregate-session',
    destination: 'node',
    kind: 'command',
    label: 'durable Node acceptance',
  },
  {
    id: 'command-aggregate-socket',
    source: 'node',
    destination: 'aggregate-socket',
    kind: 'command',
    label: 'pushAggregateCommand',
  },
  {
    id: 'websocket-aggregate-chain',
    source: 'aggregate-socket',
    destination: 'aavc',
    kind: 'websocket',
    label: 'locked aggregate capability',
  },
  {
    id: 'command-aggregate-stage',
    source: 'aavc',
    destination: 'aavr',
    kind: 'command',
    label: 'stage original in actor scratch',
  },
  {
    id: 'command-aggregate-admit',
    source: 'aavr',
    destination: 'ac',
    kind: 'command',
    label: 'stagedAggregateCommandOutbox',
  },
  {
    id: 'command-aggregate-execute',
    source: 'ac',
    destination: 'avr',
    kind: 'command',
    label: 'admissionResultsFanout',
  },
  {
    id: 'projection-aggregate-publish',
    source: 'avr',
    destination: 'avc',
    kind: 'projection',
    label: 'executedCommandOutbox → durable history',
  },
  {
    id: 'projection-aggregate-original',
    source: 'avr',
    destination: 'ac',
    kind: 'projection',
    label: 'executedAggregateCommandOutbox → original result',
  },
  {
    id: 'projection-aggregate-replay',
    source: 'avc',
    destination: 'aavr',
    kind: 'projection',
    label: 'executionResultsFanout',
  },
  {
    id: 'projection-aggregate-browser',
    source: 'aavr',
    destination: 'aavc',
    kind: 'projection',
    label: 'browserCommandOutbox',
  },
  {
    id: 'websocket-aggregate-broadcast',
    source: 'aavc',
    destination: 'aggregate-socket',
    kind: 'websocket',
    label: 'retained before broadcast',
  },
  {
    id: 'websocket-aggregate-output',
    source: 'aggregate-socket',
    destination: 'node',
    kind: 'websocket',
    label: 'aggregateActorOutput / replay',
  },
  {
    id: 'projection-aggregate-session',
    source: 'node',
    destination: 'aggregate-session',
    kind: 'projection',
    label: 'confirmed delta + optimistic rebase',
  },
  {
    id: 'async-provider',
    source: 'avr',
    destination: 'provider',
    kind: 'async',
    label: 'external.program; frozen payment intent',
  },
  {
    id: 'async-observation',
    source: 'provider',
    destination: 'avr',
    kind: 'async',
    label: 'recordExternal + child outbox transaction',
  },
  {
    id: 'async-continuation',
    source: 'avr',
    destination: 'ac',
    kind: 'async',
    label: 'admit private recorded child',
  },
  {
    id: 'access-service',
    source: 'session',
    destination: 'service-access',
    kind: 'access',
    label: 'authenticate / snapshot / ticket',
  },
  {
    id: 'access-service-owner',
    source: 'service-access',
    destination: 'svr',
    kind: 'access',
    label: 'authorize authored session',
  },
  {
    id: 'access-service-projection',
    source: 'service-access',
    destination: 'savr',
    kind: 'access',
    label: 'catch up and capture selected snapshot',
  },
  {
    id: 'access-service-ticket',
    source: 'service-access',
    destination: 'system',
    kind: 'access',
    label: 'single-use ticket',
  },
  {
    id: 'access-service-upgrade',
    source: 'system',
    destination: 'service-socket',
    kind: 'access',
    label: 'consume ticket / route upgrade',
  },
  {
    id: 'access-aggregate',
    source: 'aggregate-session',
    destination: 'aggregate-access',
    kind: 'access',
    label: 'authenticate / snapshot / ticket',
  },
  {
    id: 'access-aggregate-owner',
    source: 'aggregate-access',
    destination: 'avr',
    kind: 'access',
    label: 'authorize exact aggregate session',
  },
  {
    id: 'access-aggregate-projection',
    source: 'aggregate-access',
    destination: 'aavr',
    kind: 'access',
    label: 'catch up and capture selected snapshot',
  },
  {
    id: 'access-aggregate-ticket',
    source: 'aggregate-access',
    destination: 'system',
    kind: 'access',
    label: 'single-use ticket',
  },
  {
    id: 'access-aggregate-upgrade',
    source: 'system',
    destination: 'aggregate-socket',
    kind: 'access',
    label: 'consume ticket / route upgrade',
  },
  {
    id: 'projection-catalog-session',
    source: 'svr',
    destination: 'catalog-session',
    kind: 'projection',
    label: 'catalog actor path: SVC → SAVR → SAVC',
  },
  {
    id: 'access-agent-view',
    source: 'agent',
    destination: 'preview-actor',
    kind: 'access',
    label: 'system-authenticated actor query',
  },
  {
    id: 'access-agent-owner',
    source: 'preview-actor',
    destination: 'current-user',
    kind: 'access',
    label: 'quantity > 0 purchase-item preview',
  },
];
function declaredReferences(): IConnection[] {
  const links: IConnection[] = [];
  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.reference) continue;
      const destination = `${table.repoId}/${column.reference.table}`;
      if (!tables.some(candidate => candidate.id === destination)) {
        throw new Error(`Missing declared relation table ${destination}`);
      }
      links.push({
        id: `ref:${table.id}:${column.name}`,
        source: table.id,
        destination,
        kind: 'relationship',
        label: `${column.name} → ${column.reference.column}`,
        sourceColumn: column.name,
        destinationColumn: column.reference.column,
      });
    }
  }
  return links;
}
export const connections: readonly IConnection[] = [
  ...routes,
  ...declaredReferences(),
];

// Each source-grounded field comes from static syntax capture. Branded foreignKey IDs
// do not carry SQL table identity and therefore never generate relationship edges.
export const schemaCaptureSummary = {
  productionRepoTypes: 12,
  productionBaseTables: capturedProduction.length,
  visibleTables: tables.length,
  visibleColumns: tables.reduce(
    (count, table) => count + table.columns.length,
    0,
  ),
  refreshCommand: 'node visualizer/scripts/capture-schema.mjs',
};
