import { afterEach, expect, it, vi } from 'vitest';

import {
  command,
  database,
  definition,
  encodedAdmission,
  fixture,
  rejection,
} from '../../tests/nodeFixture.ts';

import { Node } from './Node.ts';
import { NodeAuthentication } from './NodeAuthentication.ts';
import { NodeSynchronization } from './NodeSynchronization.ts';

const network = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('./nodeNetwork.ts', () => ({
  nodeNetwork: () => ({
    snapshot: network.snapshot,
    ticket: async () => ({ ticket: 'ticket' }),
  }),
}));
afterEach(() => vi.unstubAllGlobals());

const socketFixture = () => {
  const sockets: TestSocket[] = [];
  const resumes: unknown[] = [];
  class TestSocket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    constructor() {
      super();
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      });
    }
    send(value: string) {
      resumes.push(JSON.parse(value));
    }
    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event('close'));
    }
    emit(value: unknown) {
      this.dispatchEvent(
        new MessageEvent('message', { data: JSON.stringify(value) }),
      );
    }
  }
  vi.stubGlobal('WebSocket', TestSocket);
  return { sockets, resumes };
};

it('resumes both cursors and commits missed terminal outcomes with their resource checkpoint', async () => {
  const { node, sqlite } = await fixture();
  const { sockets, resumes } = socketFixture();
  const auth = new NodeAuthentication(definition.identity, async admission => ({
    status: 'verified',
    value: { admission, identity: definition.identity },
  }));
  auth.register({}, async () => ({ credentials: { token: 'signature' } }));
  const sync = new NodeSynchronization(
    node,
    {
      kind: 'aggregate',
      apiUrl: definition.identity.apiUrl,
      publishableKey: 'public',
      systemName: 'test',
      targetName: 'account',
      targetVersion: 'v1',
      sessionName: 'editor',
      lock: { ...definition.lock, contracts: {} },
    },
    auth,
  );
  try {
    const first = await node.accept(command('first'));
    const second = await node.accept(command('second'));
    network.snapshot.mockResolvedValue({
      resources: [],
      aggregateIndex: 2,
      executedIndex: 2,
      executedHash: '2'.repeat(64),
      resolvedThrough: 2,
    });
    const connected = sync.resume();
    await vi.waitFor(() =>
      expect(resumes).toEqual([
        {
          nodeId: first.nodeId,
          nodeIndex: 0,
          executedIndex: 2,
          executedHash: '2'.repeat(64),
        },
      ]),
    );
    const socket = sockets[0]!;
    socket.emit({
      type: 'aggregateActorCommand',
      command: {
        id: first.id,
        nodeId: first.nodeId,
        nodeIndex: 1,
        aggregateIndex: 1,
        executedIndex: 1,
        executedHash: '1'.repeat(64),
        actorDelta: { upserted: [], deleted: [] },
        admission: encodedAdmission,
        execution: encodedAdmission,
      },
    });
    await vi.waitFor(() =>
      expect(node.status().synchronization).toBe('recovering'),
    );
    expect((await node.snapshot()).metadata).toMatchObject({
      outcomeIndex: 0,
      executedIndex: 0,
    });
    socket.emit({
      type: 'aggregateActorCommand',
      command: {
        id: second.id,
        nodeId: second.nodeId,
        nodeIndex: 2,
        aggregateIndex: 2,
        executedIndex: 2,
        executedHash: '2'.repeat(64),
        actorDelta: { upserted: [], deleted: [] },
        admission: encodedAdmission,
        execution: {
          ...encodedAdmission,
          status: 'failed',
          failure: rejection,
        },
      },
    });
    socket.emit({ type: 'replay-complete', executedIndex: 2 });
    await connected;
    expect((await node.snapshot()).metadata).toMatchObject({
      outcomeIndex: 2,
      executedIndex: 2,
    });
    expect((await node.snapshot()).unresolvedCommands).toEqual([]);
    expect(
      (await node.history({ afterNodeIndex: 1, limit: 1 }))[0]?.execution,
    ).toMatchObject({ status: 'failed', failure: rejection });

    const third = await node.accept(command('third'));
    const pushed = sync.push(true);
    await vi.waitFor(() =>
      expect(resumes.at(-1)).toMatchObject({
        type: 'pushAggregateCommand',
        command: { id: third.id, nodeIndex: 3 },
      }),
    );
    expect(resumes.at(-1)).not.toHaveProperty('command.staging');
    expect(resumes.at(-1)).not.toHaveProperty('command.admission');
    expect(resumes.at(-1)).not.toHaveProperty('command.execution');
    socket.emit({
      type: 'aggregateCommandAdmission',
      commandId: third.id,
      result: {
        _tag: 'Success',
        success: {
          id: third.id,
          nodeIndex: 3,
          aggregateIndex: 3,
          admission: {
            ...encodedAdmission,
            status: 'failed',
            failure: rejection,
          },
        },
      },
    });
    await expect(pushed).resolves.toEqual({ status: 'pushed' });
    expect((await node.snapshot()).unresolvedCommands).toEqual([]);
    expect((await node.snapshot()).metadata).toMatchObject({
      outcomeIndex: 2,
      executedIndex: 2,
    });
    expect(
      (await node.history({ afterNodeIndex: 2, limit: 1 }))[0],
    ).toMatchObject({
      admission: { status: 'failed', failure: rejection },
      execution: { status: 'skipped', reason: 'admission-failed' },
    });
  } finally {
    sync.stop();
    sqlite.close();
  }
});

it('routes adapted service commands through the shared receiver', async () => {
  const { db, sqlite } = database();
  const serviceDefinition = {
    ...definition,
    identity: { ...definition.identity, kind: 'service' as const },
  };
  const node = new Node(db, serviceDefinition);
  await node.initialize();
  const { sockets, resumes } = socketFixture();
  const auth = new NodeAuthentication(
    serviceDefinition.identity,
    async admission => ({
      status: 'verified',
      value: { admission, identity: serviceDefinition.identity },
    }),
  );
  auth.register({}, async () => ({ credentials: { token: 'signature' } }));
  const sync = new NodeSynchronization(
    node,
    {
      kind: 'service',
      apiUrl: definition.identity.apiUrl,
      publishableKey: 'public',
      systemName: 'test',
      targetName: 'account',
      targetVersion: 'v1',
      sessionName: 'editor',
      lock: definition.lock,
    },
    auth,
  );
  try {
    network.snapshot.mockResolvedValue({
      resources: [],
      serviceIndex: 2,
      serviceHash: '2'.repeat(64),
    });
    const connected = sync.resume();
    await vi.waitFor(() =>
      expect(resumes).toEqual([
        { serviceIndex: 2, serviceHash: '2'.repeat(64) },
      ]),
    );
    sockets[0]!.emit({
      type: 'serviceActorCommand',
      command: {
        id: 'cmd_service',
        serviceIndex: 3,
        serviceHash: '3'.repeat(64),
        actorDelta: { upserted: [], deleted: [] },
      },
    });
    sockets[0]!.emit({ type: 'replay-complete', serviceIndex: 3 });
    await connected;
    expect(await node.snapshot()).toMatchObject({
      metadata: {
        executedIndex: 3,
        executedHash: '3'.repeat(64),
        outcomeIndex: 0,
      },
    });
  } finally {
    sync.stop();
    sqlite.close();
  }
});
