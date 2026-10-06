import {
  isZerospinError,
  makeZerospinError,
  type PublicFailureSchema,
} from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import { and, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { Effect, Schema } from 'effect';

import type { IAggregateBrowserCommand } from '../aggregateSession/types.ts';
import { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import { ExecutionResultSchema } from '../contracts/ExecutionResultSchema.ts';
import { makeTableProvisioningStatements } from '../drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import { decodeNodeResource } from '../Node/decodeNodeResource.ts';
import { makeNodeResourceTables } from '../Node/makeNodeResourceTables.ts';
import { sessionKey } from '../Node/sessionKey.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';
import { NanoIdFactory } from '../utils/NanoIdFactory.ts';

import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from './aggregateNodeTables.ts';
import type {
  IAggregateNodeBaseline,
  IAggregateNodeCommandInput,
  IAggregateNodeDefinition,
  IAggregateNodeDelivery,
  IAggregateStagedCommand,
} from './types.ts';

export type IAggregateNodeCommand = typeof aggregateNodeCommands.$inferSelect;
export type IAggregateNodeSnapshot = Readonly<{
  identity: IAggregateNodeDefinition['identity'];
  state: ReturnType<AggregateNode['status']>;
  metadata: typeof aggregateNodeMetadata.$inferSelect;
  resources: readonly IEncodedResourceShape[];
  unresolvedCommands: readonly IAggregateStagedCommand[];
}>;
export type IAggregateNodeState = ReturnType<AggregateNode['status']> &
  Readonly<{
    nodeId: string;
    nodeIndex: number;
    outcomeIndex: number;
    pushPaused: boolean;
  }>;
export type IAggregateNodeSink = Readonly<{
  initialize(snapshot: IAggregateNodeSnapshot): Promise<void>;
  commands(
    commands: readonly IAggregateNodeDelivery[],
    throughChangeIndex: number,
  ): Promise<void>;
  state(state: IAggregateNodeState): Promise<void>;
}>;
type IAggregateNodeSubscriber = {
  closed: boolean;
  sending: boolean;
  wake: boolean;
  cursor: number;
  initialize: IAggregateNodeSnapshot | null;
  state: boolean;
  initialThroughChangeIndex: number;
  ready: ReturnType<typeof Promise.withResolvers<void>>;
  sink: IAggregateNodeSink;
};

/** Owns the concrete aggregate journal, resources, and committed replay cursors. */
export class AggregateNode {
  private serial: Promise<unknown> = Promise.resolve();
  private readonly subscribers = new Set<IAggregateNodeSubscriber>();
  private readonly tables;
  private persistenceFailure: unknown = null;
  private checkpointConflict: unknown = null;
  private authenticationRejected = false;
  private authenticationState = 'remembered';
  private suspended = false;
  private synchronization = 'offline';
  private connectionFailure: string | null = null;
  private admissionRejection: {
    commandId: string;
    commandName: string;
    failure: typeof PublicFailureSchema.Type;
  } | null = null;

  constructor(
    readonly db: SqliteRemoteDatabase,
    readonly definition: IAggregateNodeDefinition,
  ) {
    this.tables = makeNodeResourceTables(definition.lock.models);
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.then(work).catch(error => {
      if (!isZerospinError(error)) {
        this.persistenceFailure = error;
        this.publishState();
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
    return this.serialized(() =>
      this.transaction(async () => {
        const [version] = await this.db.values<[number]>(
          sql`PRAGMA user_version`,
        );
        const tables = await this.db.all<{ name: string }>(
          sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
        );
        if (tables.length > 0) {
          if (version?.[0] !== 8) {
            throw makeZerospinError({ code: 'node-storage-reset-required' });
          }
          const metadata = await this.metadata();
          if (
            metadata.sessionKey !== (await sessionKey(this.definition.identity))
          ) {
            throw makeZerospinError({ code: 'node-storage-identity-mismatch' });
          }
          if (!create && !metadata.initialized) {
            throw makeZerospinError({ code: 'node-storage-incomplete' });
          }
          return false;
        }
        if (!create) throw makeZerospinError({ code: 'node-storage-missing' });
        for (const table of [
          aggregateNodeMetadata,
          aggregateNodeCommands,
          ...Object.values(this.tables),
        ]) {
          for (const statement of makeTableProvisioningStatements(table)) {
            await this.db.run(sql.raw(statement));
          }
        }
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode('zerospin.executed.disposition.v1'),
        );
        await this.db.insert(aggregateNodeMetadata).values({
          id: 1,
          nodeId: await Effect.runPromise(
            makeIdFromAbbreviation({
              abbreviation: coreAbbreviations.node,
            }).pipe(Effect.provide(NanoIdFactory)),
          ),
          sessionKey: await sessionKey(this.definition.identity),
          initialized: false,
          nextNodeIndex: 1,
          outcomeIndex: 0,
          changeIndex: 0,
          aggregateIndex: 0,
          executedIndex: 0,
          executedHash: [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join(''),
          pushPaused: false,
        });
        await this.db.run(sql`PRAGMA user_version = 8`);
        return true;
      }),
    );
  }

  private async metadata() {
    const [metadata] = await this.db
      .select()
      .from(aggregateNodeMetadata)
      .where(eq(aggregateNodeMetadata.id, 1));
    if (metadata === undefined) {
      throw makeZerospinError({ code: 'node-metadata-missing' });
    }
    return metadata;
  }

  /** A baseline is installed exactly once; reconnect always resumes committed commands. */
  async initializeBaseline(baseline: IAggregateNodeBaseline): Promise<void> {
    await this.serialized(() =>
      this.transaction(async () => {
        const metadata = await this.metadata();
        if (metadata.initialized) {
          throw makeZerospinError({
            code: 'node-baseline-already-initialized',
          });
        }
        if (
          metadata.nextNodeIndex !== 1 ||
          metadata.changeIndex !== 0 ||
          baseline.resolvedThrough !== 0 ||
          !Number.isSafeInteger(baseline.executedIndex) ||
          baseline.executedIndex < 0 ||
          !Number.isSafeInteger(baseline.aggregateIndex) ||
          baseline.aggregateIndex < 0 ||
          !/^[a-f0-9]{64}$/u.test(baseline.executedHash)
        ) {
          throw makeZerospinError({ code: 'node-baseline-checkpoint-invalid' });
        }
        for (const resource of baseline.resources) {
          const table = this.tables[resource.modelName];
          const model = this.definition.lock.models[resource.modelName];
          if (table === undefined || model === undefined) {
            throw makeZerospinError({ code: 'node-resource-model-invalid' });
          }
          await this.db
            .insert(table)
            .values(decodeNodeResource(resource, model.propertiesShape));
        }
        await this.db
          .update(aggregateNodeMetadata)
          .set({
            initialized: true,
            aggregateIndex: baseline.aggregateIndex,
            executedIndex: baseline.executedIndex,
            executedHash: baseline.executedHash,
          })
          .where(eq(aggregateNodeMetadata.id, 1));
      }),
    );
  }

  snapshot(): Promise<IAggregateNodeSnapshot> {
    return this.serialized(() => this.readSnapshot());
  }

  private async readSnapshot(): Promise<IAggregateNodeSnapshot> {
    const metadata = await this.metadata();
    const resources: IEncodedResourceShape[] = [];
    for (const [modelName, table] of Object.entries(this.tables)) {
      const model = this.definition.lock.models[modelName];
      if (model === undefined) {
        throw makeZerospinError({ code: 'node-resource-model-invalid' });
      }
      for (const resource of await this.db.select().from(table)) {
        if (typeof resource.id !== 'string') {
          throw makeZerospinError({ code: 'node-resource-invalid' });
        }
        resources.push(
          decodeNodeResource(
            { ...resource, id: resource.id, modelName },
            model.propertiesShape,
          ),
        );
      }
    }
    const unresolved = await this.db
      .select()
      .from(aggregateNodeCommands)
      .where(
        and(
          isNotNull(aggregateNodeCommands.nodeIndex),
          isNull(aggregateNodeCommands.executedIndex),
        ),
      )
      .orderBy(aggregateNodeCommands.nodeIndex);
    return {
      identity: this.definition.identity,
      state: this.status(),
      metadata,
      resources,
      unresolvedCommands: unresolved.map(row =>
        this.staged(row, metadata.nodeId),
      ),
    };
  }

  private staged(
    row: IAggregateNodeCommand,
    nodeId: string,
  ): IAggregateStagedCommand {
    if (
      row.nodeIndex === null ||
      row.payload === null ||
      row.contractVersion === null ||
      row.aggregateId === null ||
      row.aggregateName === null ||
      row.actorName === null ||
      row.actorVersion === null ||
      row.sessionName === null ||
      row.claims === null ||
      row.staging === null
    ) {
      throw makeZerospinError({ code: 'node-command-input-missing' });
    }
    return {
      id: row.id,
      commandName: row.commandName,
      payload: row.payload,
      contractVersion: row.contractVersion,
      aggregateId: row.aggregateId,
      aggregateName: row.aggregateName,
      actorName: row.actorName,
      actorVersion: row.actorVersion,
      sessionName: row.sessionName,
      claims: row.claims,
      staging: row.staging,
      nodeId,
      nodeIndex: row.nodeIndex,
      admissionIndex: row.admissionIndex,
    };
  }

  private terminal(row: IAggregateNodeCommand): IAggregateBrowserCommand {
    if (
      row.executedIndex === null ||
      row.executedHash === null ||
      row.aggregateIndex === null ||
      row.delta === null
    ) {
      throw makeZerospinError({ code: 'node-command-terminal-missing' });
    }
    return {
      id: row.id,
      commandName: row.commandName,
      delta: Schema.decodeUnknownSync(ActorDeltaSchema)(row.delta),
      admission: Schema.decodeUnknownSync(Schema.NullOr(AdmissionResultSchema))(
        row.admission,
      ),
      execution: Schema.decodeUnknownSync(Schema.NullOr(ExecutionResultSchema))(
        row.execution,
      ),
      executedIndex: row.executedIndex,
      aggregateIndex: row.aggregateIndex,
      executedHash: row.executedHash,
    };
  }

  /** Snapshot capture and registration share one boundary; callbacks never hold SQLite. */
  async subscribe(
    input: { afterChangeIndex?: number },
    sink: IAggregateNodeSink,
  ): Promise<() => void> {
    const subscriber: IAggregateNodeSubscriber = {
      closed: false,
      sending: false,
      wake: false,
      cursor: 0,
      initialize: null,
      state: true,
      initialThroughChangeIndex: 0,
      ready: Promise.withResolvers<void>(),
      sink,
    };
    await this.serialized(async () => {
      const metadata = await this.metadata();
      if (input.afterChangeIndex !== undefined) {
        if (
          !Number.isSafeInteger(input.afterChangeIndex) ||
          input.afterChangeIndex < 0 ||
          input.afterChangeIndex > metadata.changeIndex
        ) {
          throw makeZerospinError({ code: 'node-subscription-cursor-invalid' });
        }
        subscriber.cursor = input.afterChangeIndex;
      } else {
        subscriber.initialize = await this.readSnapshot();
        subscriber.cursor = subscriber.initialize.metadata.changeIndex;
      }
      subscriber.initialThroughChangeIndex = metadata.changeIndex;
      this.subscribers.add(subscriber);
    });
    this.schedule(subscriber);
    await subscriber.ready.promise;
    return () => {
      subscriber.closed = true;
      this.subscribers.delete(subscriber);
    };
  }

  private schedule(subscriber: IAggregateNodeSubscriber): void {
    if (subscriber.closed) return;
    subscriber.wake = true;
    if (subscriber.sending) return;
    subscriber.sending = true;
    void Promise.resolve().then(async () => {
      try {
        if (subscriber.initialize !== null) {
          const snapshot = subscriber.initialize;
          subscriber.initialize = null;
          await subscriber.sink.initialize(snapshot);
        }
        while (!subscriber.closed) {
          subscriber.wake = false;
          if (subscriber.cursor >= subscriber.initialThroughChangeIndex) {
            subscriber.ready.resolve();
          }
          if (subscriber.state) {
            subscriber.state = false;
            const state = await this.serialized(async () => {
              if (subscriber.closed) return null;
              const metadata = await this.metadata();
              return {
                ...this.status(),
                nodeId: metadata.nodeId,
                nodeIndex: metadata.nextNodeIndex - 1,
                outcomeIndex: metadata.outcomeIndex,
                pushPaused: metadata.pushPaused,
              };
            });
            if (state !== null && !subscriber.closed) {
              await subscriber.sink.state(state);
            }
          }
          const page = await this.serialized(async () => {
            if (subscriber.closed) {
              return { commands: [], throughChangeIndex: subscriber.cursor };
            }
            const { nodeId } = await this.metadata();
            const rows = await this.db
              .select()
              .from(aggregateNodeCommands)
              .where(gt(aggregateNodeCommands.changeIndex, subscriber.cursor))
              .orderBy(aggregateNodeCommands.changeIndex)
              .limit(100);
            const commands: IAggregateNodeDelivery[] = [];
            for (const row of rows) {
              if (row.nodeIndex !== null) {
                commands.push(this.staged(row, nodeId));
              }
              if (row.executedIndex !== null) commands.push(this.terminal(row));
            }
            return {
              commands,
              throughChangeIndex: rows.at(-1)?.changeIndex ?? subscriber.cursor,
            };
          });
          if (subscriber.closed) break;
          if (page.throughChangeIndex === subscriber.cursor) break;
          await subscriber.sink.commands(
            page.commands,
            page.throughChangeIndex,
          );
          subscriber.cursor = page.throughChangeIndex;
          if (subscriber.cursor >= subscriber.initialThroughChangeIndex) {
            subscriber.ready.resolve();
          }
        }
      } catch (error) {
        subscriber.ready.reject(error);
        subscriber.closed = true;
        this.subscribers.delete(subscriber);
      } finally {
        subscriber.sending = false;
        if (!subscriber.closed && (subscriber.state || subscriber.wake)) {
          this.schedule(subscriber);
        }
      }
    });
  }

  private publishCommands(): void {
    for (const subscriber of this.subscribers) {
      subscriber.state = true;
      this.schedule(subscriber);
    }
  }
  private publishState(): void {
    for (const subscriber of this.subscribers) {
      subscriber.state = true;
      this.schedule(subscriber);
    }
  }

  async accept(command: IAggregateNodeCommandInput): Promise<void> {
    await this.serialized(async () => {
      const metadata = await this.metadata();
      const [retained] = await this.db
        .select()
        .from(aggregateNodeCommands)
        .where(
          and(
            eq(aggregateNodeCommands.id, command.id),
            isNotNull(aggregateNodeCommands.nodeIndex),
          ),
        );
      if (retained !== undefined) {
        const prior = this.staged(retained, metadata.nodeId);
        const {
          nodeId: _nodeId,
          nodeIndex: _nodeIndex,
          admissionIndex: _admissionIndex,
          ...input
        } = prior;
        if ((await sessionKey(command)) !== (await sessionKey(input))) {
          throw makeZerospinError({ code: 'node-command-id-conflict' });
        }
        await this.transaction(async () => {
          const changeIndex = metadata.changeIndex + 1;
          await this.db
            .update(aggregateNodeCommands)
            .set({ changeIndex })
            .where(
              eq(aggregateNodeCommands.journalIndex, retained.journalIndex),
            );
          await this.db
            .update(aggregateNodeMetadata)
            .set({ changeIndex })
            .where(eq(aggregateNodeMetadata.id, 1));
        });
        return;
      }
      if (!metadata.initialized || this.status().blockedWork) {
        throw makeZerospinError({ code: 'node-staging-blocked' });
      }
      const identity = this.definition.identity;
      if (
        command.aggregateId !== identity.aggregateId ||
        command.aggregateName !== identity.aggregateName ||
        command.actorName !== identity.actorName ||
        command.actorVersion !== identity.actorVersion ||
        command.sessionName !== identity.sessionName ||
        (await sessionKey({ ...identity, claims: command.claims })) !==
          (await sessionKey(identity))
      ) {
        throw makeZerospinError({ code: 'node-command-identity-mismatch' });
      }
      await this.transaction(async () => {
        const changeIndex = metadata.changeIndex + 1;
        await this.db.insert(aggregateNodeCommands).values({
          ...command,
          changeIndex,
          nodeIndex: metadata.nextNodeIndex,
          admissionIndex: null,
          admission: null,
          execution: null,
        });
        await this.db
          .update(aggregateNodeMetadata)
          .set({ nextNodeIndex: metadata.nextNodeIndex + 1, changeIndex })
          .where(eq(aggregateNodeMetadata.id, 1));
      });
    });
    this.publishCommands();
  }

  history(input: {
    afterJournalIndex: number;
    limit: number;
  }): Promise<readonly IAggregateNodeCommand[]> {
    if (
      !Number.isSafeInteger(input.afterJournalIndex) ||
      input.afterJournalIndex < 0 ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200
    ) {
      return Promise.reject(
        makeZerospinError({ code: 'node-history-page-invalid' }),
      );
    }
    return this.serialized(() =>
      this.db
        .select()
        .from(aggregateNodeCommands)
        .where(gt(aggregateNodeCommands.journalIndex, input.afterJournalIndex))
        .orderBy(aggregateNodeCommands.journalIndex)
        .limit(input.limit),
    );
  }

  async setPushPaused(pushPaused: boolean): Promise<void> {
    await this.serialized(() =>
      this.db
        .update(aggregateNodeMetadata)
        .set({ pushPaused })
        .where(eq(aggregateNodeMetadata.id, 1))
        .then(() => undefined),
    );
    this.publishState();
  }

  nextPush(manual = false): Promise<IAggregateStagedCommand | null> {
    return this.serialized(async () => {
      const metadata = await this.metadata();
      if (this.status().blockedWork) {
        throw makeZerospinError({ code: 'node-push-blocked' });
      }
      if (!manual && metadata.pushPaused) return null;
      const [row] = await this.db
        .select()
        .from(aggregateNodeCommands)
        .where(
          and(
            isNotNull(aggregateNodeCommands.nodeIndex),
            isNull(aggregateNodeCommands.admissionIndex),
            isNull(aggregateNodeCommands.executedIndex),
          ),
        )
        .orderBy(aggregateNodeCommands.nodeIndex)
        .limit(1);
      return row === undefined ? null : this.staged(row, metadata.nodeId);
    });
  }

  async reconcileAdmission(expectedNodeIndex: number): Promise<void> {
    await this.serialized(() =>
      this.transaction(async () => {
        const metadata = await this.metadata();
        if (
          !Number.isSafeInteger(expectedNodeIndex) ||
          expectedNodeIndex <= metadata.outcomeIndex ||
          expectedNodeIndex >= metadata.nextNodeIndex
        ) {
          throw makeZerospinError({ code: 'node-admission-history-conflict' });
        }
        const rows = await this.db
          .select()
          .from(aggregateNodeCommands)
          .where(
            and(
              gte(aggregateNodeCommands.nodeIndex, expectedNodeIndex),
              isNotNull(aggregateNodeCommands.admissionIndex),
              isNull(aggregateNodeCommands.executedIndex),
            ),
          )
          .orderBy(aggregateNodeCommands.nodeIndex);
        let changeIndex = metadata.changeIndex;
        for (const row of rows) {
          await this.db
            .update(aggregateNodeCommands)
            .set({ admissionIndex: null, changeIndex: ++changeIndex })
            .where(eq(aggregateNodeCommands.journalIndex, row.journalIndex));
        }
        await this.db
          .update(aggregateNodeMetadata)
          .set({ changeIndex })
          .where(eq(aggregateNodeMetadata.id, 1));
      }),
    );
    this.publishCommands();
  }

  async admitted(input: {
    id: IAggregateNodeCommandInput['id'];
    nodeIndex: number;
    admissionIndex: number;
    admission: typeof AdmissionResultSchema.Encoded;
  }): Promise<void> {
    if (
      (input.admission.status !== 'succeeded' &&
        input.admission.status !== 'failed') ||
      !Number.isSafeInteger(input.admissionIndex) ||
      input.admissionIndex < 1
    ) {
      throw makeZerospinError({ code: 'node-admission-result-invalid' });
    }
    await this.serialized(() =>
      this.transaction(async () => {
        const metadata = await this.metadata();
        const [row] = await this.db
          .select()
          .from(aggregateNodeCommands)
          .where(eq(aggregateNodeCommands.nodeIndex, input.nodeIndex));
        if (
          row === undefined ||
          row.id !== input.id ||
          (row.admissionIndex !== null &&
            row.admissionIndex !== input.admissionIndex)
        ) {
          throw makeZerospinError({ code: 'node-admission-conflict' });
        }
        if (row.admissionIndex === input.admissionIndex) return;
        const changeIndex = metadata.changeIndex + 1;
        await this.db
          .update(aggregateNodeCommands)
          .set({
            admissionIndex: input.admissionIndex,
            admission: input.admission,
            changeIndex,
          })
          .where(eq(aggregateNodeCommands.journalIndex, row.journalIndex));
        await this.db
          .update(aggregateNodeMetadata)
          .set({ changeIndex })
          .where(eq(aggregateNodeMetadata.id, 1));
      }),
    );
    this.publishCommands();
  }

  /** Retention, resource changes, local settlement, and all cursors commit together. */
  async receiveCommand(command: IAggregateBrowserCommand): Promise<void> {
    if (this.checkpointConflict !== null) {
      throw makeZerospinError({ code: 'node-synchronization-blocked' });
    }
    try {
      await this.serialized(() =>
        this.transaction(async () => {
          const metadata = await this.metadata();
          if (
            !metadata.initialized ||
            !Number.isSafeInteger(command.executedIndex) ||
            command.executedIndex < 1 ||
            !Number.isSafeInteger(command.aggregateIndex) ||
            command.aggregateIndex < 0 ||
            !/^[a-f0-9]{64}$/u.test(command.executedHash)
          ) {
            throw makeZerospinError({
              code: 'node-execution-checkpoint-invalid',
            });
          }
          const [occurrence] = await this.db
            .select()
            .from(aggregateNodeCommands)
            .where(
              eq(aggregateNodeCommands.executedIndex, command.executedIndex),
            );
          if (occurrence !== undefined) {
            if (
              (await sessionKey(
                JSON.parse(JSON.stringify(this.terminal(occurrence))),
              )) !== (await sessionKey(JSON.parse(JSON.stringify(command))))
            ) {
              throw makeZerospinError({ code: 'node-outcome-conflict' });
            }
            return;
          }
          if (
            command.executedIndex > metadata.executedIndex + 1 ||
            (command.executedIndex === metadata.executedIndex &&
              command.executedHash !== metadata.executedHash) ||
            (command.executedIndex > metadata.executedIndex &&
              command.aggregateIndex < metadata.aggregateIndex)
          ) {
            throw makeZerospinError({
              code: 'node-execution-gap',
              extra: { expectedExecutedIndex: metadata.executedIndex + 1 },
            });
          }
          const [submitted] = await this.db
            .select()
            .from(aggregateNodeCommands)
            .where(
              and(
                eq(aggregateNodeCommands.id, command.id),
                isNotNull(aggregateNodeCommands.nodeIndex),
                isNull(aggregateNodeCommands.executedIndex),
              ),
            );
          if (
            submitted !== undefined &&
            submitted.commandName !== command.commandName
          ) {
            throw makeZerospinError({ code: 'node-outcome-conflict' });
          }
          const changeIndex = metadata.changeIndex + 1;
          const terminal = {
            changeIndex,
            id: command.id,
            commandName: command.commandName,
            executedIndex: command.executedIndex,
            aggregateIndex: command.aggregateIndex,
            executedHash: command.executedHash,
            delta: Schema.encodeSync(ActorDeltaSchema)(command.delta),
            admission: Schema.encodeSync(Schema.NullOr(AdmissionResultSchema))(
              command.admission,
            ),
            execution: Schema.encodeSync(Schema.NullOr(ExecutionResultSchema))(
              command.execution,
            ),
          };
          if (submitted === undefined) {
            await this.db.insert(aggregateNodeCommands).values(terminal);
          } else {
            await this.db
              .update(aggregateNodeCommands)
              .set(terminal)
              .where(
                eq(aggregateNodeCommands.journalIndex, submitted.journalIndex),
              );
          }
          if (command.executedIndex > metadata.executedIndex) {
            for (const ref of command.delta.deleted) {
              const table = this.tables[ref.modelName];
              if (table === undefined) {
                throw makeZerospinError({
                  code: 'node-resource-model-invalid',
                });
              }
              const id = getTableConfig(table).columns.find(
                column => column.name === 'id',
              );
              if (id === undefined) {
                throw makeZerospinError({
                  code: 'node-resource-model-invalid',
                });
              }
              await this.db.delete(table).where(eq(id, ref.id));
            }
            for (const resource of command.delta.upserted) {
              const table = this.tables[resource.modelName];
              const model = this.definition.lock.models[resource.modelName];
              if (table === undefined || model === undefined) {
                throw makeZerospinError({
                  code: 'node-resource-model-invalid',
                });
              }
              const id = getTableConfig(table).columns.find(
                column => column.name === 'id',
              );
              if (id === undefined) {
                throw makeZerospinError({
                  code: 'node-resource-model-invalid',
                });
              }
              const row = decodeNodeResource(resource, model.propertiesShape);
              await this.db
                .insert(table)
                .values(row)
                .onConflictDoUpdate({ target: id, set: row });
            }
          }
          let outcomeIndex = metadata.outcomeIndex;
          const resolved = await this.db
            .select({
              nodeIndex: aggregateNodeCommands.nodeIndex,
              executedIndex: aggregateNodeCommands.executedIndex,
            })
            .from(aggregateNodeCommands)
            .where(gt(aggregateNodeCommands.nodeIndex, outcomeIndex))
            .orderBy(aggregateNodeCommands.nodeIndex);
          for (const row of resolved) {
            if (
              row.nodeIndex !== outcomeIndex + 1 ||
              row.executedIndex === null
            ) {
              break;
            }
            outcomeIndex = row.nodeIndex;
          }
          await this.db
            .update(aggregateNodeMetadata)
            .set({
              changeIndex,
              outcomeIndex,
              ...(command.executedIndex > metadata.executedIndex
                ? {
                    aggregateIndex: command.aggregateIndex,
                    executedIndex: command.executedIndex,
                    executedHash: command.executedHash,
                  }
                : {}),
            })
            .where(eq(aggregateNodeMetadata.id, 1));
        }),
      );
      this.publishCommands();
    } catch (error) {
      this.checkpointConflict = error;
      this.connectionState('blocked', error);
      throw error;
    }
  }

  admissionRejected(rejection: {
    commandId: string;
    commandName: string;
    failure: typeof PublicFailureSchema.Type;
  }): void {
    this.admissionRejection = rejection;
    this.connectionState('blocked', rejection.failure.message);
  }

  connectionState(state: string, failure?: unknown): void {
    if (state === 'online' && this.checkpointConflict === null) {
      this.admissionRejection = null;
    }
    if (state === 'authenticating') {
      this.authenticationState = 'authenticating';
    } else if (
      state === 'offline' &&
      this.authenticationState === 'authenticating'
    ) {
      this.authenticationState = 'unavailable';
    }
    this.synchronization = this.checkpointConflict === null ? state : 'blocked';
    this.connectionFailure =
      this.checkpointConflict !== null
        ? String(this.checkpointConflict)
        : failure === undefined
          ? null
          : String(failure);
    this.publishState();
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
      synchronization: this.synchronization,
      blockedWork:
        this.authenticationRejected ||
        this.suspended ||
        this.persistenceFailure !== null ||
        this.synchronization === 'blocked',
      admissionRejection: this.admissionRejection,
      failure:
        this.persistenceFailure === null
          ? this.connectionFailure
          : String(this.persistenceFailure),
    };
  }
  async authenticated(
    identity: IAggregateNodeDefinition['identity'],
    current: () => boolean = () => true,
  ): Promise<void> {
    if (
      (await sessionKey(identity)) !==
      (await sessionKey(this.definition.identity))
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
    });
    this.publishState();
  }
  async rejectAuthentication(): Promise<void> {
    await this.serialized(async () => {
      this.authenticationRejected = true;
    });
    this.publishState();
  }
  async clearAuthentication(): Promise<void> {
    await this.serialized(async () => {
      this.suspended = true;
      this.admissionRejection = null;
    });
    this.publishState();
  }
}
