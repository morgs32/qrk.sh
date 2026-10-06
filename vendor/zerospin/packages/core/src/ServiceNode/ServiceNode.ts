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

import { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import { ExecutionResultSchema } from '../contracts/ExecutionResultSchema.ts';
import { makeTableProvisioningStatements } from '../drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import { decodeNodeResource } from '../Node/decodeNodeResource.ts';
import { makeNodeResourceTables } from '../Node/makeNodeResourceTables.ts';
import { sessionKey } from '../Node/sessionKey.ts';
import type { IServiceBrowserCommand } from '../serviceSession/types.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';
import { NanoIdFactory } from '../utils/NanoIdFactory.ts';

import {
  serviceNodeCommands,
  serviceNodeMetadata,
} from './serviceNodeTables.ts';
import type {
  IServiceNodeBaseline,
  IServiceNodeCommandInput,
  IServiceNodeDefinition,
  IServiceNodeDelivery,
  IServiceStagedCommand,
} from './types.ts';

export type IServiceNodeCommand = typeof serviceNodeCommands.$inferSelect;
export type IServiceNodeSnapshot = Readonly<{
  identity: IServiceNodeDefinition['identity'];
  state: ReturnType<ServiceNode['status']>;
  metadata: typeof serviceNodeMetadata.$inferSelect;
  resources: readonly IEncodedResourceShape[];
  unresolvedCommands: readonly IServiceStagedCommand[];
}>;
export type IServiceNodeState = ReturnType<ServiceNode['status']> &
  Readonly<{
    nodeId: string;
    nodeIndex: number;
    outcomeIndex: number;
    pushPaused: boolean;
  }>;
export type IServiceNodeSink = Readonly<{
  initialize(snapshot: IServiceNodeSnapshot): Promise<void>;
  commands(
    commands: readonly IServiceNodeDelivery[],
    throughChangeIndex: number,
  ): Promise<void>;
  state(state: IServiceNodeState): Promise<void>;
}>;
type IServiceNodeSubscriber = {
  closed: boolean;
  sending: boolean;
  wake: boolean;
  cursor: number;
  initialize: IServiceNodeSnapshot | null;
  state: boolean;
  initialThroughChangeIndex: number;
  ready: ReturnType<typeof Promise.withResolvers<void>>;
  sink: IServiceNodeSink;
};

/** Owns the concrete service journal, resources, and committed replay cursors. */
export class ServiceNode {
  private serial: Promise<unknown> = Promise.resolve();
  private readonly subscribers = new Set<IServiceNodeSubscriber>();
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
    readonly definition: IServiceNodeDefinition,
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
          if (version?.[0] !== 9) {
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
          serviceNodeMetadata,
          serviceNodeCommands,
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
        await this.db.insert(serviceNodeMetadata).values({
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
          serviceIndex: 0,
          executedIndex: 0,
          serviceHash: [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join(''),
          pushPaused: false,
        });
        await this.db.run(sql`PRAGMA user_version = 9`);
        return true;
      }),
    );
  }

  private async metadata() {
    const [metadata] = await this.db
      .select()
      .from(serviceNodeMetadata)
      .where(eq(serviceNodeMetadata.id, 1));
    if (metadata === undefined) {
      throw makeZerospinError({ code: 'node-metadata-missing' });
    }
    return metadata;
  }

  /** A baseline is installed exactly once; reconnect always resumes committed commands. */
  async initializeBaseline(baseline: IServiceNodeBaseline): Promise<void> {
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
          !Number.isSafeInteger(baseline.serviceIndex) ||
          baseline.serviceIndex < 0 ||
          !/^[a-f0-9]{64}$/u.test(baseline.serviceHash)
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
          .update(serviceNodeMetadata)
          .set({
            initialized: true,
            serviceIndex: baseline.serviceIndex,
            executedIndex: baseline.executedIndex,
            serviceHash: baseline.serviceHash,
          })
          .where(eq(serviceNodeMetadata.id, 1));
      }),
    );
  }

  snapshot(): Promise<IServiceNodeSnapshot> {
    return this.serialized(() => this.readSnapshot());
  }

  private async readSnapshot(): Promise<IServiceNodeSnapshot> {
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
      .from(serviceNodeCommands)
      .where(
        and(
          isNotNull(serviceNodeCommands.nodeIndex),
          isNull(serviceNodeCommands.executedIndex),
        ),
      )
      .orderBy(serviceNodeCommands.nodeIndex);
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
    row: IServiceNodeCommand,
    nodeId: string,
  ): IServiceStagedCommand {
    if (
      row.nodeIndex === null ||
      row.payload === null ||
      row.contractVersion === null ||
      row.serviceName === null ||
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
      serviceName: row.serviceName,
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

  private terminal(row: IServiceNodeCommand): IServiceBrowserCommand {
    if (
      row.executedIndex === null ||
      row.serviceHash === null ||
      row.serviceIndex === null ||
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
      serviceIndex: row.serviceIndex,
      serviceHash: row.serviceHash,
    };
  }

  /** Snapshot capture and registration share one boundary; callbacks never hold SQLite. */
  async subscribe(
    input: { afterChangeIndex?: number },
    sink: IServiceNodeSink,
  ): Promise<() => void> {
    const subscriber: IServiceNodeSubscriber = {
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

  private schedule(subscriber: IServiceNodeSubscriber): void {
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
              .from(serviceNodeCommands)
              .where(gt(serviceNodeCommands.changeIndex, subscriber.cursor))
              .orderBy(serviceNodeCommands.changeIndex)
              .limit(100);
            const commands: IServiceNodeDelivery[] = [];
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

  async accept(command: IServiceNodeCommandInput): Promise<void> {
    await this.serialized(async () => {
      const metadata = await this.metadata();
      const [retained] = await this.db
        .select()
        .from(serviceNodeCommands)
        .where(
          and(
            eq(serviceNodeCommands.id, command.id),
            isNotNull(serviceNodeCommands.nodeIndex),
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
            .update(serviceNodeCommands)
            .set({ changeIndex })
            .where(eq(serviceNodeCommands.journalIndex, retained.journalIndex));
          await this.db
            .update(serviceNodeMetadata)
            .set({ changeIndex })
            .where(eq(serviceNodeMetadata.id, 1));
        });
        return;
      }
      if (!metadata.initialized || this.status().blockedWork) {
        throw makeZerospinError({ code: 'node-staging-blocked' });
      }
      const identity = this.definition.identity;
      if (
        command.serviceName !== identity.serviceName ||
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
        await this.db.insert(serviceNodeCommands).values({
          ...command,
          changeIndex,
          nodeIndex: metadata.nextNodeIndex,
          admissionIndex: null,
          admission: null,
          execution: null,
        });
        await this.db
          .update(serviceNodeMetadata)
          .set({ nextNodeIndex: metadata.nextNodeIndex + 1, changeIndex })
          .where(eq(serviceNodeMetadata.id, 1));
      });
    });
    this.publishCommands();
  }

  history(input: {
    afterJournalIndex: number;
    limit: number;
  }): Promise<readonly IServiceNodeCommand[]> {
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
        .from(serviceNodeCommands)
        .where(gt(serviceNodeCommands.journalIndex, input.afterJournalIndex))
        .orderBy(serviceNodeCommands.journalIndex)
        .limit(input.limit),
    );
  }

  async setPushPaused(pushPaused: boolean): Promise<void> {
    await this.serialized(() =>
      this.db
        .update(serviceNodeMetadata)
        .set({ pushPaused })
        .where(eq(serviceNodeMetadata.id, 1))
        .then(() => undefined),
    );
    this.publishState();
  }

  nextPush(manual = false): Promise<IServiceStagedCommand | null> {
    return this.serialized(async () => {
      const metadata = await this.metadata();
      if (this.status().blockedWork) {
        throw makeZerospinError({ code: 'node-push-blocked' });
      }
      if (!manual && metadata.pushPaused) return null;
      const [row] = await this.db
        .select()
        .from(serviceNodeCommands)
        .where(
          and(
            isNotNull(serviceNodeCommands.nodeIndex),
            isNull(serviceNodeCommands.admissionIndex),
            isNull(serviceNodeCommands.executedIndex),
          ),
        )
        .orderBy(serviceNodeCommands.nodeIndex)
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
          .from(serviceNodeCommands)
          .where(
            and(
              gte(serviceNodeCommands.nodeIndex, expectedNodeIndex),
              isNotNull(serviceNodeCommands.admissionIndex),
              isNull(serviceNodeCommands.executedIndex),
            ),
          )
          .orderBy(serviceNodeCommands.nodeIndex);
        let changeIndex = metadata.changeIndex;
        for (const row of rows) {
          await this.db
            .update(serviceNodeCommands)
            .set({ admissionIndex: null, changeIndex: ++changeIndex })
            .where(eq(serviceNodeCommands.journalIndex, row.journalIndex));
        }
        await this.db
          .update(serviceNodeMetadata)
          .set({ changeIndex })
          .where(eq(serviceNodeMetadata.id, 1));
      }),
    );
    this.publishCommands();
  }

  async admitted(input: {
    id: IServiceNodeCommandInput['id'];
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
          .from(serviceNodeCommands)
          .where(eq(serviceNodeCommands.nodeIndex, input.nodeIndex));
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
          .update(serviceNodeCommands)
          .set({
            admissionIndex: input.admissionIndex,
            admission: input.admission,
            changeIndex,
          })
          .where(eq(serviceNodeCommands.journalIndex, row.journalIndex));
        await this.db
          .update(serviceNodeMetadata)
          .set({ changeIndex })
          .where(eq(serviceNodeMetadata.id, 1));
      }),
    );
    this.publishCommands();
  }

  /** Retention, resource changes, local settlement, and all cursors commit together. */
  async receiveCommand(command: IServiceBrowserCommand): Promise<void> {
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
            !Number.isSafeInteger(command.serviceIndex) ||
            command.serviceIndex < 0 ||
            !/^[a-f0-9]{64}$/u.test(command.serviceHash)
          ) {
            throw makeZerospinError({
              code: 'node-execution-checkpoint-invalid',
            });
          }
          const [occurrence] = await this.db
            .select()
            .from(serviceNodeCommands)
            .where(
              eq(serviceNodeCommands.executedIndex, command.executedIndex),
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
              command.serviceHash !== metadata.serviceHash) ||
            (command.executedIndex > metadata.executedIndex &&
              command.serviceIndex < metadata.serviceIndex)
          ) {
            throw makeZerospinError({
              code: 'node-execution-gap',
              extra: { expectedExecutedIndex: metadata.executedIndex + 1 },
            });
          }
          const [submitted] = await this.db
            .select()
            .from(serviceNodeCommands)
            .where(
              and(
                eq(serviceNodeCommands.id, command.id),
                isNotNull(serviceNodeCommands.nodeIndex),
                isNull(serviceNodeCommands.executedIndex),
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
            serviceIndex: command.serviceIndex,
            serviceHash: command.serviceHash,
            delta: Schema.encodeSync(ActorDeltaSchema)(command.delta),
            admission: Schema.encodeSync(Schema.NullOr(AdmissionResultSchema))(
              command.admission,
            ),
            execution: Schema.encodeSync(Schema.NullOr(ExecutionResultSchema))(
              command.execution,
            ),
          };
          if (submitted === undefined) {
            await this.db.insert(serviceNodeCommands).values(terminal);
          } else {
            await this.db
              .update(serviceNodeCommands)
              .set(terminal)
              .where(
                eq(serviceNodeCommands.journalIndex, submitted.journalIndex),
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
              nodeIndex: serviceNodeCommands.nodeIndex,
              executedIndex: serviceNodeCommands.executedIndex,
            })
            .from(serviceNodeCommands)
            .where(gt(serviceNodeCommands.nodeIndex, outcomeIndex))
            .orderBy(serviceNodeCommands.nodeIndex);
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
            .update(serviceNodeMetadata)
            .set({
              changeIndex,
              outcomeIndex,
              ...(command.executedIndex > metadata.executedIndex
                ? {
                    serviceIndex: command.serviceIndex,
                    executedIndex: command.executedIndex,
                    serviceHash: command.serviceHash,
                  }
                : {}),
            })
            .where(eq(serviceNodeMetadata.id, 1));
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
    identity: IServiceNodeDefinition['identity'],
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
