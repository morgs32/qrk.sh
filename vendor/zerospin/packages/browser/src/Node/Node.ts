import type { IAggregateActorCommand } from '@zerospin/core/aggregateSession/types';
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionSummarySchema } from '@zerospin/core/contracts/ExecutionSummarySchema';
import { makeTableProvisioningStatements } from '@zerospin/core/drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { and, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { Effect, Schema } from 'effect';

import { makeNodeResourceTables } from './makeNodeResourceTables.ts';
import { nodeKey } from './nodeKey.ts';
import { nodeCommands, nodeMetadata } from './nodeTables.ts';
import type {
  INodeCommandInput,
  INodeDefinition,
  INodeOutcome,
  INodeRecovery,
  INodeResource,
} from './types.ts';

export type INodeCommand = typeof nodeCommands.$inferSelect & {
  nodeId: string;
};
export type INodeSnapshot = {
  identity: INodeDefinition['identity'];
  state: ReturnType<Node['status']>;
  metadata: typeof nodeMetadata.$inferSelect;
  resources: readonly INodeResource[];
  unresolvedCommands: readonly INodeCommand[];
};
export type INodeChange =
  | { type: 'resnapshot' }
  | { type: 'state'; state: ReturnType<Node['status']> }
  | { type: 'snapshot'; snapshot: INodeSnapshot }
  | { type: 'accepted'; command: INodeCommand }
  | { type: 'outcome'; outcome: INodeOutcome }
  | { type: 'pushPaused'; pushPaused: boolean }
  | {
      type: 'execution';
      command: IAggregateActorCommand;
      outcome: INodeOutcome | null;
    };
type INodeSubscriber = {
  closed: boolean;
  pending: INodeChange[];
  sending: boolean;
  receive(change: INodeChange): Promise<void>;
};

/** Owns committed state. Only database work runs inside the serialization boundary. */
export class Node {
  private serial: Promise<unknown> = Promise.resolve();
  private readonly subscribers = new Set<INodeSubscriber>();
  private readonly tables;
  private recovery: {
    snapshot: INodeRecovery;
    outcomes: Map<number, INodeOutcome>;
  } | null = null;
  private persistenceFailure: unknown = null;
  private authenticationRejected = false;
  private authenticationState = 'remembered';
  private suspended = false;
  private synchronization = 'offline';
  private connectionFailure: string | null = null;

  connectionState(state: string, failure?: unknown): void {
    if (state === 'authenticating') {
      this.authenticationState = 'authenticating';
    } else if (
      state === 'offline' &&
      this.authenticationState === 'authenticating'
    ) {
      this.authenticationState = 'unavailable';
    }
    this.synchronization = state;
    this.connectionFailure = failure === undefined ? null : String(failure);
    this.publish({ type: 'state', state: this.status() });
  }

  constructor(
    readonly db: SqliteRemoteDatabase,
    readonly definition: INodeDefinition,
  ) {
    this.tables = makeNodeResourceTables(definition.lock.models);
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(work).catch(error => {
      if (!isZerospinError(error)) {
        this.persistenceFailure = error;
        this.publish({ type: 'state', state: this.status() });
      }
      throw error;
    });
    this.serial = result.catch(() => undefined);
    return result;
  }

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.db.run(sql`BEGIN IMMEDIATE`);
    try {
      const result = await work();
      await this.db.run(sql`COMMIT`);
      return result;
    } catch (error) {
      await this.db.run(sql`ROLLBACK`).catch(() => undefined);
      throw error;
    }
  }

  async initialize(create = true): Promise<boolean> {
    let created = false;
    await this.serialized(() =>
      this.transaction(async () => {
        const [existing] = await this.db.values<[number]>(
          sql`PRAGMA user_version`,
        );
        const tables = await this.db.all<{ name: string }>(
          sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
        );
        if (tables.length > 0 && existing?.[0] !== 5) {
          throw makeZerospinError({ code: 'node-storage-reset-required' });
        }
        if (tables.length > 0) {
          if (
            (await this.metadata()).definitionKey !==
            (await nodeKey(this.definition.identity))
          ) {
            throw makeZerospinError({ code: 'node-storage-identity-mismatch' });
          }
          if (!create && !(await this.metadata()).initialized) {
            throw makeZerospinError({ code: 'node-storage-incomplete' });
          }
          return;
        }
        if (!create) throw makeZerospinError({ code: 'node-storage-missing' });
        created = true;
        for (const table of [
          nodeMetadata,
          nodeCommands,
          ...Object.values(this.tables),
        ]) {
          for (const statement of makeTableProvisioningStatements(table)) {
            await this.db.run(sql.raw(statement));
          }
        }
        await this.db.insert(nodeMetadata).values({
          id: 1,
          nodeId: await Effect.runPromise(
            makeIdFromAbbreviation({
              abbreviation: coreAbbreviations.node,
            }).pipe(Effect.provide(NanoIdFactory)),
          ),
          definitionKey: await nodeKey(this.definition.identity),
          initialized: false,
          nextNodeIndex: 1,
          outcomeIndex: 0,
          aggregateIndex: 0,
          executedIndex: 0,
          executedHash: [
            ...new Uint8Array(
              await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode('zerospin.executed.disposition.v1'),
              ),
            ),
          ]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join(''),
          pushPaused: false,
        });
        await this.db.run(sql`PRAGMA user_version = 5`);
      }),
    );
    return created;
  }

  private async metadata() {
    const metadata = await this.db
      .select()
      .from(nodeMetadata)
      .where(eq(nodeMetadata.id, 1))
      .all()
      .then(rows => rows[0]);
    if (metadata === undefined) {
      throw makeZerospinError({ code: 'node-metadata-missing' });
    }
    return metadata;
  }

  snapshot() {
    return this.serialized(() => this.readSnapshot());
  }

  private async readSnapshot(): Promise<INodeSnapshot> {
    const metadata = await this.metadata();
    const resources: INodeResource[] = [];
    for (const [modelName, table] of Object.entries(this.tables)) {
      for (const row of await this.db.select().from(table)) {
        if (typeof row.id !== 'string') {
          throw makeZerospinError({ code: 'node-resource-invalid' });
        }
        resources.push(
          Schema.decodeUnknownSync(Schema.toType(EncodedResourceSchema))({
            ...row,
            id: row.id,
            modelName,
          }),
        );
      }
    }
    const commands = await this.db
      .select()
      .from(nodeCommands)
      .where(isNull(nodeCommands.executedIndex))
      .orderBy(nodeCommands.nodeIndex);
    return {
      identity: this.definition.identity,
      state: this.status(),
      metadata,
      resources,
      unresolvedCommands: commands
        .filter(
          command =>
            command.admission.status !== 'failed' &&
            command.execution.status === 'pending',
        )
        .map(command => ({
          ...command,
          nodeId: metadata.nodeId,
        })),
    };
  }

  /** Registration and snapshot capture are one serialized operation. Delivery never holds SQLite. */
  async subscribe(receive: INodeSubscriber['receive']): Promise<() => void> {
    const subscriber: INodeSubscriber = {
      receive,
      closed: false,
      pending: [],
      sending: false,
    };
    await this.serialized(async () => {
      const snapshot = await this.readSnapshot();
      this.subscribers.add(subscriber);
      this.enqueue(subscriber, { type: 'snapshot', snapshot });
    });
    return () => this.detach(subscriber);
  }

  private detach(subscriber: INodeSubscriber): void {
    subscriber.closed = true;
    subscriber.pending.length = 0;
    this.subscribers.delete(subscriber);
  }

  private enqueue(subscriber: INodeSubscriber, change: INodeChange): void {
    if (subscriber.closed) return;
    if (subscriber.pending.length >= 64) {
      subscriber.pending = [{ type: 'resnapshot' }];
      return;
    }
    subscriber.pending.push(change);
    if (subscriber.sending) return;
    subscriber.sending = true;
    // Start callbacks in a later task, outside the committing operation.
    void Promise.resolve().then(async () => {
      try {
        while (!subscriber.closed) {
          const next = subscriber.pending.shift();
          if (next === undefined) break;
          await subscriber.receive(next);
        }
      } catch {
        this.detach(subscriber);
      } finally {
        subscriber.sending = false;
      }
    });
  }

  private publish(change: INodeChange): void {
    for (const subscriber of this.subscribers) this.enqueue(subscriber, change);
  }

  async accept(command: INodeCommandInput): Promise<INodeCommand> {
    return this.serialized(async () => {
      const metadata = await this.metadata();
      const retained = await this.db
        .select()
        .from(nodeCommands)
        .where(eq(nodeCommands.id, command.id))
        .all()
        .then(rows => rows[0]);
      if (retained !== undefined) {
        return { ...retained, nodeId: metadata.nodeId };
      }
      if (
        this.persistenceFailure !== null ||
        this.authenticationRejected ||
        this.suspended ||
        this.synchronization === 'blocked'
      ) {
        throw makeZerospinError({ code: 'node-staging-blocked' });
      }
      const identity = this.definition.identity;
      if (
        identity.kind !== 'aggregate' ||
        command.aggregateId !== identity.targetId ||
        command.aggregateName !== identity.targetName ||
        command.actorName !== identity.actorName ||
        command.actorVersion !== identity.actorVersion ||
        command.sessionName !== identity.sessionName ||
        command.staging === undefined ||
        (await nodeKey({
          ...identity,
          claims: command.claims,
        })) !== (await nodeKey(identity))
      ) {
        throw makeZerospinError({ code: 'node-command-target-mismatch' });
      }
      const { nodeId, nextNodeIndex: nodeIndex } = metadata;
      try {
        const accepted = await this.transaction(async () => {
          const [row] = await this.db
            .insert(nodeCommands)
            .values({
              ...command,
              nodeIndex,
              admission: { status: 'pending' },
              execution: { status: 'pending' },
            })
            .returning();
          if (row === undefined) {
            throw makeZerospinError({ code: 'node-command-not-retained' });
          }
          await this.db
            .update(nodeMetadata)
            .set({ nextNodeIndex: nodeIndex + 1 })
            .where(eq(nodeMetadata.id, 1));
          return { ...row, nodeId };
        });
        this.publish({ type: 'accepted', command: accepted });
        return accepted;
      } catch (error) {
        this.persistenceFailure = error;
        this.publish({ type: 'state', state: this.status() });
        throw error;
      }
    });
  }

  async history(props: {
    afterNodeIndex: number;
    limit: number;
  }): Promise<readonly INodeCommand[]> {
    if (
      !Number.isSafeInteger(props.afterNodeIndex) ||
      props.afterNodeIndex < 0 ||
      !Number.isSafeInteger(props.limit) ||
      props.limit < 1 ||
      props.limit > 200
    ) {
      throw makeZerospinError({ code: 'node-history-page-invalid' });
    }
    return this.serialized(async () => {
      const { nodeId } = await this.metadata();
      const rows = await this.db
        .select()
        .from(nodeCommands)
        .where(gt(nodeCommands.nodeIndex, props.afterNodeIndex))
        .orderBy(nodeCommands.nodeIndex)
        .limit(props.limit);
      return rows.map(row => ({ ...row, nodeId }));
    });
  }

  async setPushPaused(pushPaused: boolean): Promise<void> {
    await this.serialized(async () => {
      await this.db
        .update(nodeMetadata)
        .set({ pushPaused })
        .where(eq(nodeMetadata.id, 1));
      this.publish({ type: 'pushPaused', pushPaused });
    });
  }

  async nextPush(manual = false): Promise<INodeCommand | null> {
    return this.serialized(async () => {
      const metadata = await this.metadata();
      if (
        this.suspended ||
        this.authenticationRejected ||
        this.persistenceFailure !== null ||
        this.synchronization === 'blocked'
      ) {
        throw makeZerospinError({ code: 'node-push-blocked' });
      }
      if (!manual && metadata.pushPaused) return null;
      const command = await this.db
        .select()
        .from(nodeCommands)
        .where(isNull(nodeCommands.aggregateIndex))
        .orderBy(nodeCommands.nodeIndex)
        .limit(1)
        .all()
        .then(rows => rows[0]);
      return command === undefined
        ? null
        : { ...command, nodeId: metadata.nodeId };
    });
  }

  /** Resend a retained unresolved prefix requested by admission; never change node positions. */
  async reconcileAdmission(expectedNodeIndex: number): Promise<void> {
    await this.serialized(async () => {
      const metadata = await this.metadata();
      if (
        !Number.isSafeInteger(expectedNodeIndex) ||
        expectedNodeIndex <= metadata.outcomeIndex ||
        expectedNodeIndex >= metadata.nextNodeIndex
      ) {
        throw makeZerospinError({ code: 'node-admission-history-conflict' });
      }
      await this.db
        .update(nodeCommands)
        .set({ aggregateIndex: null })
        .where(
          and(
            gte(nodeCommands.nodeIndex, expectedNodeIndex),
            isNull(nodeCommands.executedIndex),
          ),
        );
    });
  }

  async admitted(props: {
    id: INodeCommandInput['id'];
    nodeIndex: number;
    aggregateIndex: number;
    admission: typeof AdmissionResultSchema.Encoded;
  }): Promise<void> {
    if (
      props.admission.status !== 'succeeded' &&
      props.admission.status !== 'failed'
    ) {
      throw makeZerospinError({ code: 'node-admission-result-invalid' });
    }
    await this.serialized(async () => {
      const row = await this.db
        .select()
        .from(nodeCommands)
        .where(eq(nodeCommands.id, props.id))
        .all()
        .then(rows => rows[0]);
      if (
        row === undefined ||
        row.nodeIndex !== props.nodeIndex ||
        (row.aggregateIndex !== null &&
          row.aggregateIndex !== props.aggregateIndex)
      ) {
        throw makeZerospinError({ code: 'node-admission-conflict' });
      }
      await this.db
        .update(nodeCommands)
        .set({
          aggregateIndex: props.aggregateIndex,
          ...(row.admission.status === 'pending'
            ? {
                admission: props.admission,
                ...(props.admission.status === 'failed'
                  ? {
                      execution: {
                        status: 'skipped' as const,
                        reason: 'admission-failed' as const,
                      },
                    }
                  : {}),
              }
            : {}),
        })
        .where(eq(nodeCommands.id, props.id));
      this.publish({ type: 'resnapshot' });
    });
  }

  /** Snapshot state remains private until its complete outcome prefix can commit with it. */
  async beginRecovery(snapshot: INodeRecovery): Promise<void> {
    await this.serialized(async () => {
      const metadata = await this.metadata();
      if (
        !Number.isSafeInteger(snapshot.aggregateIndex) ||
        snapshot.aggregateIndex < 0 ||
        !Number.isSafeInteger(snapshot.resolvedThrough) ||
        snapshot.resolvedThrough < 0 ||
        !Number.isSafeInteger(snapshot.executedIndex) ||
        snapshot.executedIndex < 0 ||
        !/^[a-f0-9]{64}$/u.test(snapshot.executedHash) ||
        snapshot.executedIndex < metadata.executedIndex ||
        snapshot.resolvedThrough < metadata.outcomeIndex ||
        snapshot.resolvedThrough >= metadata.nextNodeIndex
      ) {
        throw makeZerospinError({ code: 'node-recovery-checkpoint-invalid' });
      }
      this.recovery = { snapshot, outcomes: new Map() };
      await this.finishRecovery();
    });
  }

  private async validateOutcome(outcome: INodeOutcome) {
    const metadata = await this.metadata();
    const row = await this.db
      .select()
      .from(nodeCommands)
      .where(eq(nodeCommands.nodeIndex, outcome.nodeIndex))
      .all()
      .then(rows => rows[0]);
    if (
      outcome.admission === null ||
      outcome.execution === null ||
      !['succeeded', 'failed'].includes(outcome.admission.status) ||
      !['succeeded', 'failed', 'skipped'].includes(outcome.execution.status) ||
      metadata.nodeId !== outcome.nodeId ||
      row?.id !== outcome.id ||
      (row.aggregateIndex !== null &&
        row.aggregateIndex !== outcome.aggregateIndex) ||
      (row.executedIndex !== null &&
        (row.executedIndex !== outcome.executedIndex ||
          row.executedHash !== outcome.executedHash))
    ) {
      throw makeZerospinError({ code: 'node-outcome-conflict' });
    }
    return {
      row,
      admission: Schema.encodeSync(AdmissionResultSchema)(outcome.admission),
      execution: Schema.encodeSync(ExecutionSummarySchema)(outcome.execution),
    };
  }

  private async recordOutcome(outcome: INodeOutcome): Promise<void> {
    const { row, admission, execution } = await this.validateOutcome(outcome);
    if (row.executedIndex !== null) return;
    await this.db
      .update(nodeCommands)
      .set({
        aggregateIndex: outcome.aggregateIndex,
        executedIndex: outcome.executedIndex,
        executedHash: outcome.executedHash,
        actorDelta: outcome.actorDelta,
        admission,
        execution,
      })
      .where(eq(nodeCommands.id, outcome.id));
  }

  private async finishRecovery(): Promise<void> {
    const recovery = this.recovery;
    if (recovery === null) return;
    const metadata = await this.metadata();
    for (
      let index = metadata.outcomeIndex + 1;
      index <= recovery.snapshot.resolvedThrough;
      index++
    ) {
      if (!recovery.outcomes.has(index)) return;
    }
    await this.transaction(async () => {
      for (const outcome of recovery.outcomes.values()) {
        await this.recordOutcome(outcome);
      }
      for (const table of Object.values(this.tables)) {
        await this.db.delete(table);
      }
      for (const resource of recovery.snapshot.resources) {
        const table = this.tables[resource.modelName];
        if (table === undefined) {
          throw makeZerospinError({ code: 'node-resource-model-invalid' });
        }
        await this.db.insert(table).values(resource);
      }
      await this.db
        .update(nodeMetadata)
        .set({
          outcomeIndex: recovery.snapshot.resolvedThrough,
          aggregateIndex: recovery.snapshot.aggregateIndex,
          executedIndex: recovery.snapshot.executedIndex,
          executedHash: recovery.snapshot.executedHash,
          initialized: true,
        })
        .where(eq(nodeMetadata.id, 1));
    });
    this.recovery = null;
    this.publish({ type: 'snapshot', snapshot: await this.readSnapshot() });
  }

  /** Reconcile owned results independently from resource execution, in one commit when both are new. */
  async receiveCommand(command: IAggregateActorCommand): Promise<void> {
    await this.serialized(async () => {
      const metadata = await this.metadata();
      const outcome =
        command.nodeId === metadata.nodeId && command.nodeIndex !== null
          ? {
              ...command,
              nodeId: metadata.nodeId,
              nodeIndex: command.nodeIndex,
            }
          : null;
      // Validate owned duplicates even when their resource position is covered.
      if (outcome !== null) await this.validateOutcome(outcome);
      if (this.recovery !== null) {
        if (command.executedIndex > this.recovery.snapshot.executedIndex) {
          throw makeZerospinError({ code: 'node-recovery-incomplete' });
        }
        if (outcome !== null && outcome.nodeIndex > metadata.outcomeIndex) {
          if (
            !Number.isSafeInteger(outcome.nodeIndex) ||
            outcome.nodeIndex < 1 ||
            outcome.nodeIndex > this.recovery.snapshot.resolvedThrough
          ) {
            throw makeZerospinError({ code: 'node-recovery-outcome-invalid' });
          }
          const prior = this.recovery.outcomes.get(outcome.nodeIndex);
          if (
            prior !== undefined &&
            (prior.id !== outcome.id ||
              prior.aggregateIndex !== outcome.aggregateIndex ||
              prior.executedIndex !== outcome.executedIndex ||
              prior.executedHash !== outcome.executedHash)
          ) {
            throw makeZerospinError({ code: 'node-outcome-conflict' });
          }
          this.recovery.outcomes.set(outcome.nodeIndex, outcome);
          await this.finishRecovery();
        }
        return;
      }
      if (
        command.executedIndex > metadata.executedIndex &&
        command.executedIndex !== metadata.executedIndex + 1
      ) {
        throw makeZerospinError({
          code: 'node-execution-gap',
          extra: { expectedExecutedIndex: metadata.executedIndex + 1 },
        });
      }
      const missingOutcome =
        outcome !== null && outcome.nodeIndex > metadata.outcomeIndex
          ? outcome
          : null;
      if (
        missingOutcome !== null &&
        missingOutcome.nodeIndex !== metadata.outcomeIndex + 1
      ) {
        throw makeZerospinError({
          code: 'node-outcome-gap',
          extra: { expectedNodeIndex: metadata.outcomeIndex + 1 },
        });
      }
      if (command.executedIndex <= metadata.executedIndex) {
        if (
          command.executedIndex === metadata.executedIndex &&
          command.executedHash !== metadata.executedHash
        ) {
          throw makeZerospinError({
            code: 'node-execution-gap',
            extra: { expectedExecutedIndex: metadata.executedIndex + 1 },
          });
        }
        if (missingOutcome !== null) {
          await this.transaction(async () => {
            await this.recordOutcome(missingOutcome);
            await this.db
              .update(nodeMetadata)
              .set({ outcomeIndex: missingOutcome.nodeIndex })
              .where(eq(nodeMetadata.id, 1));
          });
          this.publish({ type: 'outcome', outcome: missingOutcome });
        }
        return;
      }
      await this.transaction(async () => {
        for (const ref of command.actorDelta.deleted) {
          const table = this.tables[ref.modelName];
          if (table === undefined) {
            throw makeZerospinError({ code: 'node-resource-model-invalid' });
          }
          const id = getTableConfig(table).columns.find(
            column => column.name === 'id',
          );
          if (id === undefined) {
            throw makeZerospinError({ code: 'node-resource-model-invalid' });
          }
          await this.db.delete(table).where(eq(id, ref.id));
        }
        for (const resource of command.actorDelta.upserted) {
          const table = this.tables[resource.modelName];
          if (table === undefined) {
            throw makeZerospinError({ code: 'node-resource-model-invalid' });
          }
          const id = getTableConfig(table).columns.find(
            column => column.name === 'id',
          );
          if (id === undefined) {
            throw makeZerospinError({ code: 'node-resource-model-invalid' });
          }
          await this.db
            .insert(table)
            .values(resource)
            .onConflictDoUpdate({ target: id, set: resource });
        }
        if (missingOutcome !== null) await this.recordOutcome(missingOutcome);
        await this.db
          .update(nodeMetadata)
          .set({
            aggregateIndex: command.aggregateIndex,
            executedIndex: command.executedIndex,
            executedHash: command.executedHash,
            outcomeIndex: missingOutcome?.nodeIndex ?? metadata.outcomeIndex,
          })
          .where(eq(nodeMetadata.id, 1));
      });
      this.publish({ type: 'execution', command, outcome: missingOutcome });
    });
  }

  status() {
    return {
      localAvailability:
        this.persistenceFailure === null ? 'available' : 'failed',
      authentication: this.suspended
        ? 'signed-out'
        : this.authenticationRejected
          ? 'rejected'
          : this.authenticationState,
      synchronization:
        this.recovery === null ? this.synchronization : 'recovering',
      blockedWork:
        this.authenticationRejected ||
        this.suspended ||
        this.persistenceFailure !== null ||
        this.synchronization === 'blocked',
      failure:
        this.persistenceFailure === null
          ? this.connectionFailure
          : String(this.persistenceFailure),
    };
  }

  async authenticated(
    identity: INodeDefinition['identity'],
    current: () => boolean = () => true,
  ): Promise<void> {
    if (
      (await nodeKey(identity)) !== (await nodeKey(this.definition.identity))
    ) {
      throw makeZerospinError({
        code: 'node-authentication-identity-mismatch',
      });
    }
    await this.serialized(async () => {
      if (!current()) {
        throw makeZerospinError({ code: 'node-authentication-cancelled' });
      }
      this.authenticationRejected = false;
      this.authenticationState = 'verified';
      this.suspended = false;
      this.publish({ type: 'state', state: this.status() });
    });
  }

  async rejectAuthentication(): Promise<void> {
    await this.serialized(async () => {
      this.authenticationRejected = true;
      this.publish({ type: 'state', state: this.status() });
    });
  }

  async clearAuthentication(): Promise<void> {
    await this.serialized(async () => {
      this.suspended = true;
      this.recovery = null;
      this.publish({ type: 'state', state: this.status() });
    });
  }
}
