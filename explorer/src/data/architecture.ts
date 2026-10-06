import type {
  IConnection,
  IEntity,
  IGraphScope,
  IRepo,
  ITable,
} from '../types';

import schemaSnapshot from './schema-snapshot.json';
import { tablePurposes } from './table-purposes';

const worker = 'packages/system-worker/src';
const aggregateIdentity =
  'systemId; aggregateName; aggregateId; aggregateVersion';
const aggregateActorIdentity = `${aggregateIdentity}; actorName; actorVersion; actorPath`;
const serviceIdentity = 'systemId; serviceName; serviceVersion';
const serviceActorIdentity = `${serviceIdentity}; actorName; actorVersion; actorPath`;

/** Generic repository types and browser databases; app-authored model tables are omitted. */
export const repos: readonly IRepo[] = [
  {
    id: 'system',
    name: 'SystemRepo',
    abbreviation: 'sysrepo',
    owner: 'system',
    repoType: 'SystemRepo',
    identity: 'systemId',
    description:
      'Immutable authored definition locks, activated repo catalog, and single-use websocket tickets. Routes upgraded connections to the exact actor chain.',
    source: { path: `${worker}/SystemRepo/SystemRepo.ts` },
    position: { x: 0, y: 2 },
  },
  {
    id: 'log',
    name: 'SystemLogRepo',
    abbreviation: 'syslogrepo',
    owner: 'system',
    repoType: 'SystemLogRepo',
    identity: 'systemId',
    description:
      'Admission diagnostics and telemetry, independent of business-command ordering.',
    source: { path: `${worker}/SystemLogRepo/SystemLogRepo.ts` },
    position: { x: 1, y: 2 },
  },
  {
    id: 'ac',
    name: 'AggregateChain',
    abbreviation: 'ac',
    owner: 'aggregate',
    repoType: 'AggregateChain',
    identity: 'systemId; aggregateName; aggregateId',
    description:
      'Complete aggregate input journal. Allocates aggregateIndex, records the original execution version, and retains original results before other versions replay.',
    source: { path: `${worker}/AggregateChain/AggregateChain.ts` },
    position: { x: 1, y: 0 },
  },
  {
    id: 'avr',
    name: 'AggregateVersionRepo',
    abbreviation: 'avr',
    owner: 'aggregate',
    repoType: 'AggregateVersionRepo',
    identity: aggregateIdentity,
    description:
      'Authoritative version-owned resource database, terminal output, two independently acknowledged publication outboxes, and original async production. Authored aggregate model tables are supplied by the app.',
    source: { path: `${worker}/AggregateVersionRepo/AggregateVersionRepo.ts` },
    position: { x: 2, y: 0 },
  },
  {
    id: 'avc',
    name: 'AggregateVersionChain',
    abbreviation: 'avc',
    owner: 'aggregate',
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
    owner: 'aggregate',
    repoType: 'AggregateActorVersionRepo',
    identity: aggregateActorIdentity,
    description:
      'Confirmed owner-resource replica, selected actor graph, optimistic scratch staging, staged admission outbox, and browser publication outbox. Programs run in scratch for staging; confirmed history is replayed as operations. Authored model tables are supplied by the app.',
    source: {
      path: `${worker}/AggregateActorVersionRepo/AggregateActorVersionRepo.ts`,
    },
    position: { x: 4, y: 0 },
  },
  {
    id: 'aavc',
    name: 'AggregateActorVersionChain',
    abbreviation: 'aavc',
    owner: 'aggregate',
    repoType: 'AggregateActorVersionChain',
    identity: aggregateActorIdentity,
    description:
      'Durable selected-output log and hibernating websockets. Stages commands through AggregateActorVersionRepo, retains outputs before broadcasting, and validates resume cursors and hashes.',
    source: {
      path: `${worker}/AggregateActorVersionChain/AggregateActorVersionChain.ts`,
    },
    position: { x: 5, y: 0 },
  },
  {
    id: 'sc',
    name: 'ServiceChain',
    abbreviation: 'sc',
    owner: 'service',
    repoType: 'ServiceChain',
    identity: 'systemId; serviceName',
    description:
      'Complete service admission history. Allocates serviceIndex and fans out to authored service versions.',
    source: { path: `${worker}/ServiceChain/ServiceChain.ts` },
    position: { x: 1, y: 1 },
  },
  {
    id: 'svr',
    name: 'ServiceVersionRepo',
    abbreviation: 'svr',
    owner: 'service',
    repoType: 'ServiceVersionRepo',
    identity: serviceIdentity,
    description:
      'Authoritative service resource database. Executes original and mapped contracts, applies operations atomically and publishes durable terminal history. Authored service model tables are supplied by the app.',
    source: { path: `${worker}/ServiceVersionRepo/ServiceVersionRepo.ts` },
    position: { x: 2, y: 1 },
  },
  {
    id: 'svc',
    name: 'ServiceVersionChain',
    abbreviation: 'svc',
    owner: 'service',
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
    owner: 'service',
    repoType: 'ServiceActorVersionRepo',
    identity: serviceActorIdentity,
    description:
      'Replays owner model operations into a confirmed replica, computes selected deltas and checkpoints actor progress atomically. Authored model tables are supplied by the app.',
    source: {
      path: `${worker}/ServiceActorVersionRepo/ServiceActorVersionRepo.ts`,
    },
    position: { x: 4, y: 1 },
  },
  {
    id: 'savc',
    name: 'ServiceActorVersionChain',
    abbreviation: 'savc',
    owner: 'service',
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
    id: 'aggregate-node',
    name: 'AggregateNode',
    abbreviation: 'node',
    owner: 'browser',
    identity:
      'nodeId; sessionKey (bound aggregate session definition, owner identity and claims)',
    description:
      'A named aggregate SharedWorker owns durable selected resources and an occurrence journal. It allocates submissions, retains admission separately from terminal aggregate progress, and replays committed changes to tabs.',
    source: { path: 'packages/core/src/AggregateNode/AggregateNode.ts' },
    position: { x: 0, y: 0 },
  },
  {
    id: 'service-node',
    name: 'ServiceNode',
    abbreviation: 'node',
    owner: 'browser',
    identity:
      'nodeId; sessionKey (bound service session definition, service identity and claims)',
    description:
      'A named service SharedWorker owns durable selected resources and an occurrence journal. Service identity uses its name and version; terminal commands retain the service disposition hash and consumed service progress.',
    source: { path: 'packages/core/src/ServiceNode/ServiceNode.ts' },
    position: { x: 0, y: 1 },
  },
  {
    id: 'session',
    name: 'Service session database',
    abbreviation: 'session',
    owner: 'browser',
    identity:
      'sessionId; systemName; sessionName; serviceName; serviceVersion; actorName; actorVersion; claims',
    description:
      'In-memory database for selected service resources and browser optimistic previews. Service command identity is retained by the durable Node journal. Authored selected model tables are supplied by the app.',
    source: {
      path: 'packages/core/src/serviceSession/serviceSessionRepoTables.ts',
    },
    position: { x: 0, y: 1 },
  },
  {
    id: 'aggregate-session',
    name: 'Aggregate session database',
    abbreviation: 'aggregate session',
    owner: 'browser',
    identity:
      'sessionId; systemName; sessionName; aggregateName; aggregateId; aggregateVersion; actorName; actorVersion; claims',
    description:
      'In-memory database for the selected aggregate graph, local command journal and optimistic operations. The Shared Worker Node retains durable delivery identity and confirmed resources. Authored selected model tables are supplied by the app.',
    source: {
      path: 'packages/core/src/aggregateSession/sessionRepoDbConfig.ts',
    },
    position: { x: 0, y: 3 },
  },
];

type ISchemaTable = Pick<
  ITable,
  'name' | 'columns' | 'source' | 'indexes' | 'description'
>;
function captureTables(
  repoId: string,
  declarations: readonly ISchemaTable[],
): ITable[] {
  return declarations.map(table => {
    const id = `${repoId}/${table.name}`;
    const purpose = tablePurposes[id];
    if (purpose === undefined) {
      throw new Error(`Missing table purpose for ${id}`);
    }
    return {
      ...table,
      id,
      repoId,
      purpose,
      description: [purpose, table.description].filter(Boolean).join(' '),
    };
  });
}
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
  ...captureTables('aggregate-session', schemaSnapshot['aggregate-session']),
  ...captureTables('session', schemaSnapshot.session),
  ...captureTables('aggregate-node', schemaSnapshot['aggregate-node']),
  ...captureTables('service-node', schemaSnapshot['service-node']),
];

export const entities: readonly IEntity[] = [
  {
    id: 'service-socket',
    name: 'Service websocket',
    kind: 'socket',
    owner: 'service',
    description:
      '/ws-service-session-commands; locked service/actor capability. Resume moves awaiting-resume → replaying → live.',
    source: {
      path: `${worker}/ServiceActorVersionChain/onMessage/onMessage.ts`,
    },
    position: { x: 0, y: 1 },
  },
  {
    id: 'aggregate-socket',
    name: 'Aggregate websocket',
    kind: 'socket',
    owner: 'aggregate',
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
    owner: 'service',
    description:
      'Authenticate claims, authorize the authored session definition, capture its selected snapshot, and request a SystemRepo ticket.',
    source: { path: `${worker}/ServiceAccessApi/ServiceAccessApi.ts` },
    position: { x: 0, y: 1 },
  },
  {
    id: 'aggregate-access',
    name: 'AggregateAccessApi / AggregateSessionApi',
    kind: 'access',
    owner: 'aggregate',
    description:
      'Resolve actor claims and exact aggregate identity, authorize definition, capture selected state and create websocket ticket.',
    source: { path: `${worker}/AggregateAccessApi/AggregateAccessApi.ts` },
    position: { x: 0, y: 0 },
  },
];

const routes: readonly IConnection[] = [
  {
    id: 'session-execute-aggregate',
    source: 'aggregate-session',
    destination: 'aggregate-session',
    kind: 'session-execute',
    label: 'executeLocalSessionCommandTx · standalone / mock',
  },
  {
    id: 'command-local-service',
    source: 'session',
    destination: 'service-node',
    kind: 'session-stage',
    label: 'durable Node acceptance',
  },
  {
    id: 'command-service-socket',
    source: 'service-node',
    destination: 'service-socket',
    kind: 'session-stage',
    label: 'pushServiceCommand',
  },
  {
    id: 'session-stage-service-chain',
    source: 'service-socket',
    destination: 'savc',
    kind: 'session-stage',
    label: 'pushServiceCommand delivery',
  },
  {
    id: 'command-service-admit',
    source: 'savc',
    destination: 'sc',
    kind: 'session-stage',
    label: 'admitServiceCommand',
  },
  {
    id: 'command-service-execute',
    source: 'sc',
    destination: 'svr',
    kind: 'session-stage',
    label: 'admittedCommandsFanout',
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
    destination: 'service-node',
    kind: 'websocket',
    label: 'service commands / replay arrays',
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
    source: 'service-node',
    destination: 'session',
    kind: 'projection',
    label: 'incremental commands + optimistic rebase',
  },
  {
    id: 'command-local-aggregate',
    source: 'aggregate-session',
    destination: 'aggregate-node',
    kind: 'session-stage',
    label: 'durable Node acceptance',
  },
  {
    id: 'command-aggregate-socket',
    source: 'aggregate-node',
    destination: 'aggregate-socket',
    kind: 'session-stage',
    label: 'pushAggregateCommand',
  },
  {
    id: 'session-stage-aggregate-chain',
    source: 'aggregate-socket',
    destination: 'aavc',
    kind: 'session-stage',
    label: 'pushAggregateCommand delivery',
  },
  {
    id: 'command-aggregate-stage',
    source: 'aavc',
    destination: 'aavr',
    kind: 'session-stage',
    label: 'stage original in actor scratch',
  },
  {
    id: 'command-aggregate-admit',
    source: 'aavr',
    destination: 'ac',
    kind: 'session-stage',
    label: 'stagedAggregateCommandOutbox',
  },
  {
    id: 'command-aggregate-execute',
    source: 'ac',
    destination: 'avr',
    kind: 'session-stage',
    label: 'admittedCommandsFanout',
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
    destination: 'aggregate-node',
    kind: 'websocket',
    label: 'aggregate commands / replay arrays',
  },
  {
    id: 'projection-aggregate-session',
    source: 'aggregate-node',
    destination: 'aggregate-session',
    kind: 'projection',
    label: 'incremental commands + optimistic rebase',
  },
  {
    id: 'async-continuation',
    source: 'avr',
    destination: 'ac',
    kind: 'async',
    label: 'asyncCommandOutbox → recorded child admission',
  },
  {
    id: 'async-service-continuation',
    source: 'svr',
    destination: 'sc',
    kind: 'async',
    label: 'asyncCommandOutbox → recorded child admission',
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

export const systemOverviewScope: IGraphScope = {
  repos,
  tables,
  entities,
  connections,
};

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
  refreshCommand: 'node explorer/scripts/capture-schema.mjs',
};
