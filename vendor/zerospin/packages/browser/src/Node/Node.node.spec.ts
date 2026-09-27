import {
  admitted,
  command,
  database,
  definition,
  encodedAdmission,
  executed,
  fixture,
  rejection,
} from '@zerospin/fixtures/browser/nodeFixture';
import { encodeShape, primitives } from '@zerospin/schema';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { BrowserNode } from '../BrowserNode/BrowserNode.ts';

import { Node } from './Node.ts';
import { NodeAuthentication } from './NodeAuthentication.ts';
import { NodeCatalog } from './NodeCatalog.ts';
import type { INodeOutcome } from './types.ts';

describe('durable node storage', () => {
  it('rejects old nonempty storage without deleting its retained commands', async () => {
    const { node, db, sqlite } = await fixture();
    try {
      const retained = await node.accept(command('one'));
      await db.run(sql`PRAGMA user_version = 3`);
      await expect(new Node(db, definition).initialize()).rejects.toMatchObject(
        {
          code: 'node-storage-reset-required',
        },
      );
      const [version] = await db.values<[number]>(sql`PRAGMA user_version`);
      expect(version?.[0]).toBe(3);
      expect((await node.history({ afterNodeIndex: 0, limit: 10 }))[0]).toEqual(
        retained,
      );
    } finally {
      sqlite.close();
    }
  });

  it('allocates one order across concurrent callers and retains lost acceptance replies', async () => {
    const { node, db, sqlite } = await fixture();
    try {
      const [version] = await db.values<[number]>(sql`PRAGMA user_version`);
      expect(version?.[0]).toBe(4);
      const accepted = await Promise.all([
        node.accept(command('one')),
        node.accept(command('two')),
        node.accept(command('one')),
      ]);
      expect(accepted.map(row => row.nodeIndex)).toEqual([1, 2, 1]);
      expect(accepted[0]).toEqual(accepted[2]);
      const restarted = new Node(db, definition);
      await restarted.initialize();
      expect(await restarted.accept(command('one'))).toEqual(accepted[0]);
      expect((await restarted.accept(command('three'))).nodeIndex).toBe(3);
    } finally {
      sqlite.close();
    }
  });

  it('persists pause while manual push selects the same next committed command', async () => {
    const { node, db, sqlite } = await fixture();
    try {
      const accepted = await node.accept(command('one'));
      await node.setPushPaused(true);
      const restarted = new Node(db, definition);
      await restarted.initialize();
      expect(await restarted.nextPush()).toBeNull();
      expect(await restarted.nextPush(true)).toEqual(accepted);
      await restarted.admitted({
        id: accepted.id,
        nodeIndex: 1,
        aggregateIndex: 4,
        admission: encodedAdmission,
      });
      expect(await restarted.nextPush(true)).toBeNull();
      expect(
        (await restarted.history({ afterNodeIndex: 0, limit: 10 }))[0]
          ?.executedIndex,
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it('keeps incomplete recovery private and advances the outcome cursor only with retained outcomes', async () => {
    const { node, db, sqlite } = await fixture();
    try {
      const first = await node.accept(command('one'));
      const second = await node.accept(command('two'));
      const outcome = (row: typeof first): INodeOutcome => ({
        id: row.id,
        nodeId: row.nodeId,
        nodeIndex: row.nodeIndex,
        aggregateIndex: row.nodeIndex,
        executedIndex: row.nodeIndex,
        executedHash: String(row.nodeIndex).repeat(64),
        actorDelta: { upserted: [], deleted: [] },
        admission: admitted,
        execution: executed,
      });
      await node.beginRecovery({
        aggregateIndex: 0,
        executedIndex: 2,
        executedHash: '2'.repeat(64),
        resolvedThrough: 2,
        resources: [],
      });
      await node.receiveCommand(outcome(first));
      await expect(
        node.receiveCommand({
          ...outcome(first),
          executedHash: 'f'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'node-outcome-conflict' });
      await expect(
        node.receiveCommand({ ...outcome(second), executedIndex: 3 }),
      ).rejects.toMatchObject({ code: 'node-recovery-incomplete' });
      const restarted = new Node(db, definition);
      await restarted.initialize();
      const changes: unknown[] = [];
      await restarted.subscribe(async change => {
        changes.push(change);
      });
      await Promise.resolve();
      expect(changes[0]).toMatchObject({
        snapshot: {
          metadata: { executedIndex: 0, outcomeIndex: 0 },
          unresolvedCommands: [{ id: first.id }, { id: second.id }],
        },
      });
      await restarted.beginRecovery({
        aggregateIndex: 0,
        executedIndex: 2,
        executedHash: '2'.repeat(64),
        resolvedThrough: 2,
        resources: [],
      });
      await restarted.receiveCommand(outcome(second));
      expect(changes).toHaveLength(1);
      await restarted.receiveCommand(outcome(first));
      await Promise.resolve();
      expect(changes[1]).toMatchObject({
        snapshot: {
          metadata: { executedIndex: 2, outcomeIndex: 2 },
          unresolvedCommands: [],
        },
      });
      expect(await restarted.accept(command('one'))).toMatchObject({
        nodeIndex: 1,
        executedIndex: 1,
      });
    } finally {
      sqlite.close();
    }
  });

  it('does not let a frozen snapshot subscriber hold up acceptance or another tab', async () => {
    const { node, sqlite } = await fixture();
    try {
      await node.subscribe(() => new Promise(() => undefined));
      const changes: unknown[] = [];
      await node.subscribe(async change => {
        changes.push(change);
      });
      await node.accept(command('one'));
      await Promise.resolve();
      expect(
        changes.map(change => Reflect.get(Object(change), 'type')),
      ).toEqual(['snapshot', 'accepted']);
    } finally {
      sqlite.close();
    }
  });

  it('blocks new commands after sign-out while preserving retained commands', async () => {
    const { node, sqlite } = await fixture();
    try {
      const accepted = await node.accept(command('one'));
      await node.clearAuthentication();
      await expect(node.accept(command('two'))).rejects.toMatchObject({
        code: 'node-staging-blocked',
      });
      expect(await node.accept(command('one'))).toEqual(accepted);
    } finally {
      sqlite.close();
    }
  });
});

describe('node authentication', () => {
  it('shares attempts and accepts the first matching server-verified responder despite a frozen tab', async () => {
    const auth = new NodeAuthentication(
      definition.identity,
      async admission => ({
        status: 'verified',
        value: { admission, identity: definition.identity },
      }),
    );
    auth.register({}, () => new Promise(() => undefined));
    auth.register({}, async () => ({ credentials: { token: 'signature' } }));
    const first = auth.authenticate();
    expect(auth.authenticate()).toBe(first);
    expect((await first).admission).toEqual({
      credentials: { token: 'signature' },
    });
  });

  it('does not bind a command node to another authenticated identity', async () => {
    const auth = new NodeAuthentication(
      definition.identity,
      async admission => ({
        status: 'verified',
        value: {
          admission,
          identity: {
            ...definition.identity,
            claims: { userId: 'two' },
          },
        },
      }),
    );
    auth.register({}, async () => ({ credentials: { token: 'wrong' } }));
    await expect(auth.authenticate()).rejects.toMatchObject({
      code: 'node-authentication-unavailable',
    });
    await expect(
      auth.resume({ ...definition.identity, targetId: 'acct_other' }),
    ).rejects.toMatchObject({ code: 'node-authentication-identity-mismatch' });
  });

  it('invalidates outstanding authentication on sign-out', async () => {
    const auth = new NodeAuthentication(definition.identity, async () => ({
      status: 'unavailable',
    }));
    auth.register({}, () => new Promise(() => undefined));
    const attempt = auth.authenticate();
    auth.clear();
    await expect(attempt).rejects.toMatchObject({
      code: 'node-authentication-cancelled',
    });
    await expect(auth.authenticate()).rejects.toMatchObject({
      code: 'node-signed-out',
    });
  });
});

describe('BrowserNode RPC boundary', () => {
  it('validates complete occurrences and shares ordering across attached capabilities', async () => {
    const { node, sqlite } = await fixture();
    try {
      const first = new BrowserNode(node);
      const second = new BrowserNode(node);
      expect(
        await first.accept({ ...command('bad'), nodeIndex: 45 }),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'node-command-invalid' },
      });
      const [one, two] = await Promise.all([
        first.accept(command('one')),
        second.accept(command('two')),
      ]);
      expect(one).toMatchObject({ _tag: 'Success', success: { nodeIndex: 1 } });
      expect(two).toMatchObject({ _tag: 'Success', success: { nodeIndex: 2 } });
      expect(
        await second.history({ afterNodeIndex: 0, limit: 1 }),
      ).toMatchObject({ _tag: 'Success', success: [{ id: 'cmd_one' }] });
      expect(
        await second.history({ afterNodeIndex: 0, limit: 201 }),
      ).toMatchObject({ _tag: 'Failure' });
      await first.dispose();
      expect(await first.accept(command('three'))).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'node-tab-detached' },
      });
      expect(await second.accept(command('three'))).toMatchObject({
        _tag: 'Success',
        success: { nodeIndex: 3 },
      });
    } finally {
      sqlite.close();
    }
  });
});

describe('persistent node catalog', () => {
  it('remembers offline identity, discovers old definitions, and preserves databases across sign-out', async () => {
    const { db, sqlite } = database();
    try {
      const catalog = new NodeCatalog(db);
      await catalog.initialize();
      await catalog.authenticated(definition);
      const newer = {
        ...definition,
        identity: { ...definition.identity, definitionHash: 'b'.repeat(64) },
      };
      await catalog.authenticated(newer);
      const restarted = new NodeCatalog(db);
      await restarted.initialize();
      expect(await restarted.reopenOffline(definition.identity)).toEqual(
        definition,
      );
      expect(await restarted.discover(newer.identity)).toEqual([
        definition,
        newer,
      ]);
      await restarted.clearAuthentication(newer.identity);
      expect(await restarted.reopenOffline(definition.identity)).toBeNull();
      expect(await restarted.reopenOffline(newer.identity)).toBeNull();
      expect(await restarted.discover(newer.identity)).toHaveLength(2);
      await restarted.authenticated(newer);
      expect(await restarted.reopenOffline(newer.identity)).toEqual(newer);
      expect(await restarted.reopenOffline(definition.identity)).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});

it('retains terminal failures in the same history and resolves them after success', async () => {
  const { node, sqlite } = await fixture();
  try {
    const first = await node.accept(command('one'));
    const second = await node.accept(command('two'));
    const outcome = (
      row: typeof first,
      failure: typeof rejection | null,
    ): INodeOutcome => ({
      id: row.id,
      nodeId: row.nodeId,
      nodeIndex: row.nodeIndex,
      aggregateIndex: row.nodeIndex,
      executedIndex: row.nodeIndex,
      executedHash: String(row.nodeIndex).repeat(64),
      actorDelta: { upserted: [], deleted: [] },
      admission: admitted,
      execution:
        failure === null
          ? executed
          : { ...executed, status: 'failed', failure },
    });
    const success = outcome(first, null);
    const failure = outcome(second, rejection);
    await expect(node.receiveCommand(failure)).rejects.toMatchObject({
      code: 'node-execution-gap',
    });
    await node.receiveCommand(success);
    await node.receiveCommand(failure);
    const changes: unknown[] = [];
    await node.subscribe(async change => {
      changes.push(change);
    });
    await Promise.resolve();
    expect(changes[0]).toMatchObject({
      snapshot: { metadata: { outcomeIndex: 2 }, unresolvedCommands: [] },
    });
    expect(await node.history({ afterNodeIndex: 1, limit: 10 })).toMatchObject([
      { id: second.id, execution: { status: 'failed', failure: rejection } },
    ]);
  } finally {
    sqlite.close();
  }
});

it('bounds frozen authentication waits without accumulating pending calls', async () => {
  vi.useFakeTimers();
  try {
    const started = Promise.withResolvers<void>();
    let calls = 0;
    const auth = new NodeAuthentication(
      definition.identity,
      async () => ({ status: 'unavailable' }),
      100,
    );
    auth.register({}, () => {
      calls += 1;
      started.resolve();
      return new Promise(() => undefined);
    });
    const first = expect(auth.authenticate()).rejects.toMatchObject({
      code: 'node-authentication-unavailable',
    });
    await started.promise;
    await vi.advanceTimersByTimeAsync(100);
    await first;
    const secondAttempt = auth.authenticate();
    const second = expect(secondAttempt).rejects.toMatchObject({
      code: 'node-authentication-unavailable',
    });
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    await vi.advanceTimersByTimeAsync(100);
    await second;
    expect(calls).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it('rolls back allocation on storage failure and blocks new staging', async () => {
  const { node, db, sqlite } = await fixture();
  try {
    sqlite.exec(
      "CREATE TRIGGER fail_command BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    await expect(node.accept(command('one'))).rejects.toThrow();
    expect(node.status().localAvailability).toBe('failed');
    await expect(node.accept(command('two'))).rejects.toMatchObject({
      code: 'node-staging-blocked',
    });
    sqlite.exec('DROP TRIGGER fail_command');
    const restarted = new Node(db, definition);
    await restarted.initialize();
    expect((await restarted.accept(command('one'))).nodeIndex).toBe(1);
  } finally {
    sqlite.close();
  }
});

it('commits structured resource rows with the checkpoint and never reapplies historical outcomes', async () => {
  const { db, sqlite } = database();
  const models = {
    item: {
      modelName: 'item',
      abbreviation: 'itm',
      version: 'v1',
      propertiesShape: encodeShape({
        id: primitives.primaryKey({ abbreviation: 'itm' }),
        modelName: primitives.text(),
        version: primitives.text(),
        createdAt: primitives.date(),
        updatedAt: primitives.date(),
        count: primitives.integer(),
      }),
      indexes: [],
    },
  };
  const node = new Node(db, {
    ...definition,
    lock: { ...definition.lock, models },
  });
  try {
    await node.initialize();
    const accepted = await node.accept(command('one'));
    const row = {
      id: 'itm_one',
      modelName: 'item',
      version: 'v1',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      count: 10,
    };
    await node.beginRecovery({
      aggregateIndex: 0,
      executedIndex: 1,
      executedHash: '1'.repeat(64),
      resolvedThrough: 1,
      resources: [row],
    });
    const outcome: INodeOutcome = {
      id: accepted.id,
      nodeId: accepted.nodeId,
      nodeIndex: 1,
      aggregateIndex: 1,
      executedIndex: 1,
      executedHash: '1'.repeat(64),
      admission: admitted,
      execution: executed,
      actorDelta: { upserted: [{ ...row, count: 1 }], deleted: [] },
    };
    await node.receiveCommand(outcome);
    await node.receiveCommand(outcome);
    const changes: unknown[] = [];
    await node.subscribe(async change => {
      changes.push(change);
    });
    await Promise.resolve();
    expect(changes[0]).toMatchObject({
      snapshot: { resources: [{ id: row.id, count: 10 }] },
    });
    await expect(
      node.receiveCommand({ ...outcome, id: 'cmd_conflicting' }),
    ).rejects.toMatchObject({ code: 'node-outcome-conflict' });
    await expect(
      node.receiveCommand({ ...outcome, executedHash: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'node-outcome-conflict' });
    const external = {
      ...outcome,
      id: 'cmd_external' as const,
      nodeId: null,
      nodeIndex: null,
      executedIndex: 2,
      executedHash: '2'.repeat(64),
      actorDelta: { upserted: [{ ...row, count: 20 }], deleted: [] },
    };
    await node.receiveCommand(external);
    const fresh: unknown[] = [];
    await node.subscribe(async change => {
      fresh.push(change);
    });
    await Promise.resolve();
    expect(fresh[0]).toMatchObject({
      snapshot: {
        metadata: { executedIndex: 2, outcomeIndex: 1 },
        resources: [{ count: 20 }],
      },
    });
    const second = await node.accept(command('two'));
    const newer: INodeOutcome = {
      ...outcome,
      id: second.id,
      nodeIndex: second.nodeIndex,
      aggregateIndex: 3,
      executedIndex: 3,
      executedHash: '3'.repeat(64),
      actorDelta: { upserted: [{ ...row, count: 30 }], deleted: [] },
    };
    await expect(
      node.receiveCommand({
        ...newer,
        actorDelta: {
          upserted: [
            { ...row, count: 99 },
            { ...row, modelName: 'unavailable' },
          ],
          deleted: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'node-resource-model-invalid' });
    expect(await node.snapshot()).toMatchObject({
      metadata: { outcomeIndex: 1, executedIndex: 2 },
      resources: [{ count: 20 }],
      unresolvedCommands: [{ id: second.id }],
    });
    await node.receiveCommand(newer);
    expect(await node.snapshot()).toMatchObject({
      metadata: { outcomeIndex: 2, executedIndex: 3 },
      resources: [{ count: 30 }],
      unresolvedCommands: [],
    });
    expect(
      (await node.history({ afterNodeIndex: 1, limit: 1 }))[0],
    ).toMatchObject({
      executedIndex: 3,
      actorDelta: { upserted: [{ id: row.id, count: 30 }], deleted: [] },
    });
    // An old nonempty delta and an exact owned duplicate cannot replay resources.
    await node.receiveCommand(outcome);
    await node.receiveCommand(newer);
    expect((await node.snapshot()).resources).toMatchObject([{ count: 30 }]);
  } finally {
    sqlite.close();
  }
});

it('resends an earlier retained unresolved prefix without changing node positions', async () => {
  const { node, sqlite } = await fixture();
  try {
    const first = await node.accept(command('first'));
    const second = await node.accept(command('second'));
    await node.admitted({
      id: first.id,
      nodeIndex: 1,
      aggregateIndex: 10,
      admission: encodedAdmission,
    });
    expect(await node.nextPush()).toMatchObject({
      id: second.id,
      nodeIndex: 2,
    });
    await node.reconcileAdmission(1);
    expect(await node.nextPush()).toMatchObject({ id: first.id, nodeIndex: 1 });
    expect(
      (await node.history({ afterNodeIndex: 0, limit: 10 })).map(
        row => row.nodeIndex,
      ),
    ).toEqual([1, 2]);
  } finally {
    sqlite.close();
  }
});

it('resnapshots a slow subscriber after its bounded queue overflows', async () => {
  const { node, sqlite } = await fixture();
  const release = Promise.withResolvers<void>();
  const changes: string[] = [];
  try {
    const detach = await node.subscribe(async change => {
      changes.push(change.type);
      if (change.type === 'snapshot') await release.promise;
    });
    for (let index = 0; index < 70; index++) {
      await node.accept(command(String(index)));
    }
    expect((await node.snapshot()).metadata.nextNodeIndex).toBe(71);
    release.resolve();
    await vi.waitFor(() => expect(changes).toContain('resnapshot'));
    detach();
  } finally {
    release.resolve();
    sqlite.close();
  }
});

it('cannot resurrect signed-out authentication through an in-flight resume', async () => {
  const auth = new NodeAuthentication(definition.identity, async () => ({
    status: 'unavailable',
  }));
  const resume = auth.resume(definition.identity);
  auth.clear();
  await expect(resume).rejects.toMatchObject({
    code: 'node-authentication-cancelled',
  });
  await expect(auth.authenticate()).rejects.toMatchObject({
    code: 'node-signed-out',
  });
  const { node, sqlite } = await fixture();
  try {
    await node.clearAuthentication();
    await expect(
      node.authenticated(definition.identity, () => false),
    ).rejects.toMatchObject({ code: 'node-authentication-cancelled' });
    expect(node.status().authentication).toBe('signed-out');
  } finally {
    sqlite.close();
  }
});

it('removes rejected admission from optimism immediately without advancing authoritative checkpoints', async () => {
  const { node, db, sqlite } = await fixture();
  try {
    const first = await node.accept(command('rejected'));
    const second = await node.accept(command('remaining'));
    const admission = {
      ...encodedAdmission,
      status: 'failed' as const,
      failure: rejection,
    };
    const events: unknown[] = [];
    await node.subscribe(async event => {
      events.push(event);
    });
    await node.admitted({
      id: first.id,
      nodeIndex: first.nodeIndex,
      aggregateIndex: 1,
      admission,
    });
    await node.admitted({
      id: first.id,
      nodeIndex: first.nodeIndex,
      aggregateIndex: 1,
      admission: { ...admission, completedAt: '2026-01-02T00:00:00.000Z' },
    });
    const snapshot = await node.snapshot();
    expect(snapshot.unresolvedCommands.map(row => row.id)).toEqual([second.id]);
    expect(snapshot.metadata).toMatchObject({
      aggregateIndex: 0,
      executedIndex: 0,
      outcomeIndex: 0,
    });
    const retained = (await node.history({ afterNodeIndex: 0, limit: 10 }))[0];
    expect(retained).toMatchObject({
      admission,
      execution: { status: 'skipped', reason: 'admission-failed' },
      staging: first.staging,
    });
    expect(retained?.execution).not.toHaveProperty('failure');
    expect(retained?.execution).not.toHaveProperty('startedAt');
    await vi.waitFor(() =>
      expect(events).toContainEqual({ type: 'resnapshot' }),
    );
    const restarted = new Node(db, definition);
    await restarted.initialize();
    expect(
      (await restarted.snapshot()).unresolvedCommands.map(row => row.id),
    ).toEqual([second.id]);
    const outcome: INodeOutcome = {
      id: first.id,
      nodeId: first.nodeId,
      nodeIndex: 1,
      aggregateIndex: 1,
      executedIndex: 1,
      executedHash: '1'.repeat(64),
      actorDelta: { upserted: [], deleted: [] },
      admission: { ...admitted, status: 'failed', failure: rejection },
      execution: { status: 'skipped', reason: 'admission-failed' },
    };
    await restarted.receiveCommand(outcome);
    expect((await restarted.snapshot()).metadata).toMatchObject({
      outcomeIndex: 1,
      executedIndex: 1,
      aggregateIndex: 1,
    });
  } finally {
    sqlite.close();
  }
});

it('records historical missing results without moving resource progress and preserves node gaps', async () => {
  const { node, sqlite } = await fixture();
  try {
    const first = await node.accept(command('historical-one'));
    const second = await node.accept(command('historical-two'));
    await node.beginRecovery({
      resources: [],
      aggregateIndex: 5,
      executedIndex: 5,
      executedHash: '5'.repeat(64),
      resolvedThrough: 0,
    });
    const outcome = (row: typeof first): INodeOutcome => ({
      id: row.id,
      nodeId: row.nodeId,
      nodeIndex: row.nodeIndex,
      aggregateIndex: row.nodeIndex,
      executedIndex: row.nodeIndex,
      executedHash: String(row.nodeIndex).repeat(64),
      admission: admitted,
      execution: executed,
      actorDelta: {
        upserted: [],
        deleted: [{ id: 'itm_old', modelName: 'unavailable' }],
      },
    });
    await expect(node.receiveCommand(outcome(second))).rejects.toMatchObject({
      code: 'node-outcome-gap',
    });
    await node.receiveCommand(outcome(first));
    await node.receiveCommand(outcome(second));
    expect(await node.snapshot()).toMatchObject({
      metadata: {
        executedIndex: 5,
        executedHash: '5'.repeat(64),
        outcomeIndex: 2,
      },
      resources: [],
      unresolvedCommands: [],
    });
    await expect(
      node.receiveCommand({ ...outcome(first), aggregateIndex: 10 }),
    ).rejects.toMatchObject({ code: 'node-outcome-conflict' });
  } finally {
    sqlite.close();
  }
});
