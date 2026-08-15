import type { Async } from '@zerospin/core/async/Async';
import {
  PushBlockSchema,
  PushedCommandSchema,
  StagedReplicaCommandSchema,
  StagedSessionCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  EncodedAggregateFrontendMutationSchema,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedAggregateFrontendMutation,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IFailedStagedReplicaCommand,
  IFinalizedFailedStagedReplicaCommand,
  IPushBlock,
  IPushedCommand,
  IStagedReplicaCommand,
  IStagedSessionCommand,
} from '@zerospin/core/contracts/types';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedShape } from '@zerospin/core/models/encodeShape';
import { makeTable } from '@zerospin/core/models/makeTable';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAnyDrizzleSchemas,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import {
  AggregateFrontendBlockSchema,
  AggregateFrontendReplicaBlockSchema,
  AggregateFrontendReplicaStateSchema,
  AggregateFrontendSyncStateSchema,
} from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type {
  IAggregateFrontendBlock,
  IAggregateFrontendReplicaBlock,
  IAggregateFrontendReplicaState,
  IAggregateFrontendSyncState,
  IFrontendDelta,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import type { authenticate } from '@zerospin/frontend/authenticate';
import { createAggregateFrontendWebSocketTicket } from '@zerospin/frontend/createAggregateFrontendWebSocketTicket';
import { fetchAggregateFrontendState } from '@zerospin/frontend/fetchAggregateFrontendState';
import { pushAggregateFrontendCommands } from '@zerospin/frontend/pushAggregateFrontendCommands';
import type { TelemetryCollector } from '@zerospin/logger';
import { RpcStub } from 'capnweb';
import { and, eq, or, sql } from 'drizzle-orm';
import {
  Duration,
  Effect,
  Either,
  Fiber,
  Schema,
  type ManagedRuntime,
} from 'effect';

import type { AggregateFrontendReplicaSinkApi } from '../../acquireUserPartitionRepo.ts';
import type { makeIdbSQLite3 } from '../../drizzle/makeIdbSQLite3.ts';
import { makeTxAsync } from '../../drizzle/makeTxAsync.ts';
import type { IAsyncTx, IAsyncWaSqliteDrizzleDb } from '../../drizzle/types.ts';
import {
  aggregateFrontendSpecSchema,
  type aggregateFrontendReplicas as aggregateFrontendReplicaLocators,
  type userReplicaDbConfig,
} from '../userReplicaSchemas.ts';

const aggregateFrontendReplicaMetadataTable = makeTable({
  name: 'aggregateFrontendReplicaMetadata',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'afrp' }),
    systemVersion: primitives.text(),
    frontendIndex: primitives.integer(),
    replicaIndex: primitives.integer(),
  },
});

const aggregateFrontendCommandJournalTable = makeTable({
  name: 'aggregateFrontendCommandJournal',
  shape: {
    commandId: primitives.primaryKey({
      abbreviation: coreAbbreviations.command,
    }),
    sessionId: primitives.opaqueId({ abbreviation: 'sesn' }),
    sessionIndex: primitives.integer(),
    command: primitives.json({
      schema: Schema.Union(StagedReplicaCommandSchema, PushedCommandSchema),
    }),
    mutations: primitives.json({
      schema: Schema.Array(EncodedAggregateFrontendMutationSchema),
    }),
    appliedMutationInverses: primitives.json({
      schema: Schema.Array(EncodedAppliedMutationSchema),
    }),
  },
  indexes: [
    {
      name: 'aggregate_frontend_command_journal_session_idx',
      columns: ['sessionId', 'sessionIndex'],
      unique: true,
    },
  ],
});

export const aggregateFrontendReplicaDbConfig = makeDbConfig({
  tables: {
    aggregateFrontendReplicaMetadata: aggregateFrontendReplicaMetadataTable,
    aggregateFrontendCommandJournal: aggregateFrontendCommandJournalTable,
  },
});

export const {
  aggregateFrontendReplicaMetadata,
  aggregateFrontendCommandJournal,
} = aggregateFrontendReplicaDbConfig.schema;

const aggregateFrontendSocketMessageSchema = Schema.parseJson(
  Schema.Union(
    Schema.Struct({
      type: Schema.Literal('aggregateFrontendBlock'),
      sync: AggregateFrontendBlockSchema,
    }),
    Schema.Struct({
      type: Schema.Literal('replay-complete'),
      frontendIndex: Schema.Number,
    }),
    Schema.Struct({ type: Schema.Literal('state-required') }),
  ),
);

export const encodedShapeSchema = Schema.declare(
  (input: unknown): input is IEncodedShape => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return false;
    }
    for (const descriptor of Object.values(input)) {
      if (
        typeof descriptor !== 'object' ||
        descriptor === null ||
        !('kind' in descriptor) ||
        typeof descriptor.kind !== 'string'
      ) {
        return false;
      }
      switch (descriptor.kind) {
        case PrimitiveKind.Boolean:
        case PrimitiveKind.Cursor:
        case PrimitiveKind.Date:
        case PrimitiveKind.Enum:
        case PrimitiveKind.Integer:
        case PrimitiveKind.Json:
        case PrimitiveKind.Number:
        case PrimitiveKind.OpaqueId:
        case PrimitiveKind.PrimaryKey:
        case PrimitiveKind.Ref:
        case PrimitiveKind.Text:
          break;
        default:
          return false;
      }
    }
    return true;
  },
);

export class AggregateFrontendReplicaRepo {
  private queueTail: Promise<void> = Promise.resolve();
  private socket: WebSocket | null = null;
  private reconnectFiber: Fiber.RuntimeFiber<void, IAnyError> | null = null;
  private status: 'activating' | 'ready' | 'repairing' | 'failed';
  private socketState: 'disconnected' | 'connecting' | 'replaying' | 'online' =
    'disconnected';
  private reconnectAttempt = 0;
  private lastFailure: string | null = null;
  private onlineReplacementInstalled: boolean;
  private installedAuthority: Readonly<{
    registrationId: string;
    ownerToken: object;
    authenticatedApi: Effect.Effect.Success<
      ReturnType<typeof authenticate>
    >['authenticatedApi'];
    frontendApi: Parameters<
      typeof fetchAggregateFrontendState
    >[0]['frontendApi'];
  }> | null = null;
  private authoritySelectionAttempt: object = {};
  private authoritySelectionPromise: Promise<void> | null = null;
  private pushPaused = false;
  private inFlightPush: Promise<
    | Readonly<{ status: 'empty' }>
    | Readonly<{ status: 'pushed' }>
    | Readonly<{ status: 'retry-exhausted'; failure: IAnyErrorJson }>
    | undefined
  > | null = null;
  private pushWakePending = false;
  private registrations: Array<{
    id: string;
    sink:
      | AggregateFrontendReplicaSinkApi
      | RpcStub<AggregateFrontendReplicaSinkApi>;
    getAuthenticatedApi(props: {
      freshness: 'current' | 'refresh-if-current' | 'force';
      failedAuthenticatedApi:
        | Effect.Effect.Success<
            ReturnType<typeof authenticate>
          >['authenticatedApi']
        | null;
    }): Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
    getCurrentAuthenticatedApi():
      | Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']
      | null;
    mode: 'online' | 'existing-only';
    ownerToken: object;
    gateOpen: boolean;
    stateRequested: boolean;
    capturedSnapshot: IAggregateFrontendReplicaState | null;
    bufferedBlocks: IAggregateFrontendReplicaBlock[];
    released: boolean;
  }> = [];

  constructor(
    readonly catalogRow: typeof aggregateFrontendReplicaLocators.$inferSelect &
      typeof aggregateFrontendReplicaMetadata.$inferSelect,
    readonly userReplicaStore: {
      userId: string;
      userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
      systemId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    },
    public replicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>,
    public db: IAsyncWaSqliteDrizzleDb,
    readonly resourceSchemas: IAnyDrizzleSchemas,
    readonly frontendSpec: IFrontendControllerSpec,
    readonly runtime: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >,
    readonly authenticationRuntime: ManagedRuntime.ManagedRuntime<
      Async | PublishableKey | TelemetryCollector | ZerospinApiUrl,
      IAnyError
    >,
    readonly systemId: ISystemId,
    readonly systemName: string,
    readonly sharedWorkerApiUrl: string,
    readonly allocateRegistrationId: () => number,
    readonly aggregateReplicaRuntimes: Map<
      string,
      AggregateFrontendReplicaRepo
    >,
    initialStatus: 'activating' | 'ready',
    onlineReplacementInstalled: boolean,
  ) {
    this.status = initialStatus;
    this.onlineReplacementInstalled = onlineReplacementInstalled;
  }

  serialize<SUCCESS>(program: () => Promise<SUCCESS>): Promise<SUCCESS> {
    const result = this.queueTail.then(program);
    this.queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async getSnapshot(): Promise<IAggregateFrontendReplicaState> {
    let snapshot: IAggregateFrontendReplicaState | undefined;
    await this.runtime.runPromise(
      makeTxAsync({
        db: this.db,
        program: ({ tx }) =>
          Effect.tryPromise({
            try: async () => {
              const metadata = await tx
                .select()
                .from(aggregateFrontendReplicaMetadata)
                .where(
                  eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                )
                .get();
              if (metadata === undefined) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-replica-state-missing',
                  message:
                    'Aggregate frontend replica has no committed metadata',
                });
              }
              const rows = await tx
                .select()
                .from(aggregateFrontendCommandJournal)
                .all();
              const journal = rows
                .map(row => ({
                  row,
                  command: Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Union(
                        StagedReplicaCommandSchema,
                        PushedCommandSchema,
                      ),
                    ),
                  )(row.command, { onExcessProperty: 'error' }),
                  mutations: Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Array(EncodedAggregateFrontendMutationSchema),
                    ),
                  )(row.mutations, { onExcessProperty: 'error' }),
                  appliedMutationInverses: Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Array(EncodedAppliedMutationSchema),
                    ),
                  )(row.appliedMutationInverses, {
                    onExcessProperty: 'error',
                  }),
                }))
                .sort(
                  (left, right) =>
                    left.command.replicaIndex - right.command.replicaIndex,
                );
              const replicaIndices = new Set<number>();
              for (const entry of journal) {
                if (
                  !Number.isSafeInteger(entry.command.replicaIndex) ||
                  entry.command.replicaIndex <= 0 ||
                  entry.command.replicaIndex > metadata.replicaIndex ||
                  replicaIndices.has(entry.command.replicaIndex)
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-replica-journal-index-invalid',
                    message:
                      'Active aggregate command replica indices must be positive, safe, unique, and within the metadata frontier',
                  });
                }
                replicaIndices.add(entry.command.replicaIndex);
              }

              const resources = [...(await this.collectResources(tx))].sort(
                (left, right) =>
                  `${left.modelName}/${left.id}`.localeCompare(
                    `${right.modelName}/${right.id}`,
                  ),
              );
              snapshot = Schema.validateSync(
                AggregateFrontendReplicaStateSchema,
              )({
                aggregateId: this.catalogRow.aggregateId,
                userId: this.catalogRow.userId,
                systemId: this.systemId,
                systemVersion: metadata.systemVersion,
                aggregateName: this.catalogRow.aggregateName,
                frontendName: this.catalogRow.frontendName,
                aggregateFrontendLockKey:
                  this.catalogRow.aggregateFrontendLockKey,
                frontendIndex: metadata.frontendIndex,
                replicaIndex: metadata.replicaIndex,
                resources,
                stagedCommands: journal
                  .filter(entry => entry.command.status === 'staged')
                  .map(entry => entry.command),
                pushedCommands: journal
                  .filter(entry => entry.command.status === 'pushed')
                  .map(entry => entry.command),
                executedPushedCommands: [],
                failedStagedCommands: [],
                failedPushedCommands: [],
                optimisticAppliedMutations: journal.map(entry => ({
                  commandId: entry.command.id,
                  mutations: entry.appliedMutationInverses,
                })),
              });
            },
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'read-aggregate-frontend-replica-failed',
                    message:
                      'Failed to derive the aggregate frontend replica state',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          }),
      }),
    );
    if (snapshot === undefined) {
      throw new ZerospinError({
        code: 'aggregate-frontend-replica-state-missing',
        message:
          'Aggregate frontend replica state derivation produced no state',
      });
    }
    return snapshot;
  }

  async collectResources(
    tx: IAsyncTx,
  ): Promise<readonly IEncodedResourceShape[]> {
    const resources: IEncodedResourceShape[] = [];
    for (const resourceSchema of Object.values(this.resourceSchemas)) {
      const rows = await tx.select().from(resourceSchema).all();
      for (const row of rows) {
        resources.push(Schema.validateSync(EncodedResourceSchema)(row));
      }
    }
    return resources;
  }

  async applyEncodedMutations(props: {
    tx: IAsyncTx;
    commandId: string;
    mutations: readonly IEncodedAggregateFrontendMutation[];
    appliedAt: Date;
  }): Promise<{
    appliedMutations: readonly IEncodedAppliedMutation[];
    delta: IFrontendDelta;
  }> {
    const appliedMutations: IEncodedAppliedMutation[] = [];
    const inserted: IEncodedResourceShape[] = [];
    const updated: IEncodedResourceShape[] = [];
    const deleted: Array<{ id: string; modelName: string }> = [];

    let expectedMutationIndex = 0;
    for (const mutation of props.mutations) {
      Schema.decodeUnknownSync(EncodedAggregateFrontendMutationSchema)(
        mutation,
      );
      if (
        mutation.commandId !== props.commandId ||
        mutation.mutationIndex !== expectedMutationIndex
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-mutation-sequence-invalid',
          message:
            'Encoded frontend mutations must use the command ID and contiguous mutation order',
        });
      }
      expectedMutationIndex += 1;

      const modelSpec = this.frontendSpec.models[mutation.modelName];
      const resourceSchema = this.resourceSchemas[mutation.modelName];
      if (modelSpec === undefined || resourceSchema === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-mutation-model-missing',
          message: `Frontend model "${mutation.modelName}" is not in the acquired spec`,
        });
      }

      const modelDefinition =
        modelSpec.version === mutation.modelVersion
          ? modelSpec
          : modelSpec.historicalDefinitions.find(
              definition => definition.version === mutation.modelVersion,
            );
      if (modelDefinition === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-mutation-version-missing',
          message: `Frontend model "${mutation.modelName}" has no definition for version "${mutation.modelVersion}"`,
        });
      }

      const encodedProperties = Schema.decodeUnknownSync(encodedShapeSchema)(
        modelDefinition.properties,
      );
      const operation = Schema.decodeUnknownSync(Schema.parseJson())(
        mutation.operation,
      );
      if (
        typeof operation !== 'object' ||
        operation === null ||
        Array.isArray(operation)
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-mutation-operation-invalid',
          message: 'Encoded frontend mutation operation must be an object',
        });
      }
      const previousUnknown = await props.tx
        .select()
        .from(resourceSchema)
        .where(sql`id = ${mutation.resourceId}`)
        .get();
      const previous =
        previousUnknown === undefined
          ? null
          : Schema.validateSync(EncodedResourceSchema)(previousUnknown);
      const lastAppliedAt = previous?.updatedAt ?? null;
      let inverseOperation = 'null';

      if (mutation.operationName === 'create') {
        if (previous !== null) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-create-resource-exists',
            message: `Cannot create existing resource "${mutation.modelName}.${mutation.resourceId}"`,
          });
        }
        const rawAttributes = Reflect.get(operation, 'encodedAttributes');
        if (
          typeof rawAttributes !== 'object' ||
          rawAttributes === null ||
          Array.isArray(rawAttributes)
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-create-operation-invalid',
            message: 'Create mutation attributes are invalid',
          });
        }
        const attributes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawAttributes)) {
          const descriptor = encodedProperties[key];
          attributes[key] =
            descriptor?.kind === PrimitiveKind.Date && typeof value === 'string'
              ? new Date(value)
              : value;
        }
        const resource = Schema.validateSync(EncodedResourceSchema)({
          id: mutation.resourceId,
          modelName: mutation.modelName,
          version: mutation.modelVersion,
          createdAt: props.appliedAt,
          updatedAt: props.appliedAt,
          ...attributes,
        });
        await props.tx.insert(resourceSchema).values(resource).run();
        inserted.push(resource);
      } else if (mutation.operationName === 'update') {
        if (previous === null) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-update-resource-missing',
            message: `Cannot update missing resource "${mutation.modelName}.${mutation.resourceId}"`,
          });
        }
        const rawAttributes = Reflect.get(operation, 'encodedAttributes');
        if (
          typeof rawAttributes !== 'object' ||
          rawAttributes === null ||
          Array.isArray(rawAttributes)
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-update-operation-invalid',
            message: 'Update mutation attributes are invalid',
          });
        }
        const attributes: Record<string, unknown> = {};
        const inverseAttributes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawAttributes)) {
          const descriptor = encodedProperties[key];
          attributes[key] =
            descriptor?.kind === PrimitiveKind.Date && typeof value === 'string'
              ? new Date(value)
              : value;
          inverseAttributes[key] = previous[key];
        }
        const resource = Schema.validateSync(EncodedResourceSchema)({
          ...previous,
          ...attributes,
          updatedAt: props.appliedAt,
        });
        await props.tx
          .update(resourceSchema)
          .set({ ...attributes, updatedAt: props.appliedAt })
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        inverseOperation = JSON.stringify({
          encodedAttributes: inverseAttributes,
        });
        updated.push(resource);
      } else if (mutation.operationName === 'move') {
        if (
          previous === null ||
          typeof Reflect.get(operation, 'property') !== 'string' ||
          typeof Reflect.get(operation, 'prevId') !== 'string' ||
          typeof Reflect.get(operation, 'nextId') !== 'string'
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-move-operation-invalid',
            message: 'Move mutation target or operation is invalid',
          });
        }
        const resource = Schema.validateSync(EncodedResourceSchema)({
          ...previous,
          [Reflect.get(operation, 'property')]: Reflect.get(
            operation,
            'nextId',
          ),
          updatedAt: props.appliedAt,
        });
        await props.tx
          .update(resourceSchema)
          .set({
            [Reflect.get(operation, 'property')]: Reflect.get(
              operation,
              'nextId',
            ),
            updatedAt: props.appliedAt,
          })
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        inverseOperation = JSON.stringify({
          property: Reflect.get(operation, 'property'),
          prevId: Reflect.get(operation, 'prevId'),
        });
        updated.push(resource);
      } else if (mutation.operationName === 'delete') {
        if (previous === null) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-delete-resource-missing',
            message: `Cannot delete missing resource "${mutation.modelName}.${mutation.resourceId}"`,
          });
        }
        await props.tx
          .delete(resourceSchema)
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        inverseOperation = JSON.stringify({ resource: previous });
        deleted.push({
          id: mutation.resourceId,
          modelName: mutation.modelName,
        });
      } else {
        const rawResource = Reflect.get(operation, 'resource');
        if (
          typeof rawResource !== 'object' ||
          rawResource === null ||
          Array.isArray(rawResource)
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-replication-operation-invalid',
            message: 'Replicate-resource mutation payload is invalid',
          });
        }
        const convertedResource: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawResource)) {
          const descriptor = encodedProperties[key];
          convertedResource[key] =
            (key === 'createdAt' ||
              key === 'updatedAt' ||
              key === 'deletedAt' ||
              descriptor?.kind === PrimitiveKind.Date) &&
            typeof value === 'string'
              ? new Date(value)
              : value;
        }
        const resource = Schema.validateSync(EncodedResourceSchema)(
          convertedResource,
        );
        if (previous === null) {
          await props.tx.insert(resourceSchema).values(resource).run();
        } else {
          await props.tx
            .update(resourceSchema)
            .set(resource)
            .where(sql`id = ${mutation.resourceId}`)
            .run();
        }
        inverseOperation =
          previous === null ? 'null' : JSON.stringify({ resource: previous });
        if (previous === null) inserted.push(resource);
        else updated.push(resource);
      }

      appliedMutations.push({
        ...mutation,
        appliedAt: props.appliedAt,
        lastAppliedAt,
        inverseOperation,
      });
    }

    return {
      appliedMutations,
      delta: { inserted, updated, deleted },
    };
  }

  async reverseEncodedMutations(props: {
    tx: IAsyncTx;
    mutations: readonly IEncodedAppliedMutation[];
  }): Promise<void> {
    const mutations = [...props.mutations].sort(
      (left, right) => right.mutationIndex - left.mutationIndex,
    );
    for (const mutation of mutations) {
      Schema.validateSync(EncodedAppliedMutationSchema)(mutation);
      const resourceSchema = this.resourceSchemas[mutation.modelName];
      const modelSpec = this.frontendSpec.models[mutation.modelName];
      if (resourceSchema === undefined || modelSpec === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-inverse-model-missing',
          message: `Optimistic inverse model "${mutation.modelName}" is not in the acquired spec`,
        });
      }
      const modelDefinition =
        modelSpec.version === mutation.modelVersion
          ? modelSpec
          : modelSpec.historicalDefinitions.find(
              definition => definition.version === mutation.modelVersion,
            );
      if (modelDefinition === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-inverse-version-missing',
          message: `Optimistic inverse model "${mutation.modelName}" has no definition for version "${mutation.modelVersion}"`,
        });
      }
      const encodedProperties = Schema.decodeUnknownSync(encodedShapeSchema)(
        modelDefinition.properties,
      );
      const inverseOperation = Schema.decodeUnknownSync(Schema.parseJson())(
        mutation.inverseOperation,
      );

      if (mutation.operationName === 'create') {
        if (inverseOperation !== null) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-create-inverse-invalid',
            message: 'Create mutation inverse must be null',
          });
        }
        await props.tx
          .delete(resourceSchema)
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        continue;
      }

      if (
        mutation.operationName === 'replicateResource' &&
        inverseOperation === null
      ) {
        await props.tx
          .delete(resourceSchema)
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        continue;
      }

      if (
        typeof inverseOperation !== 'object' ||
        inverseOperation === null ||
        Array.isArray(inverseOperation)
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-inverse-invalid',
          message: `Mutation "${mutation.commandId}.${mutation.mutationIndex}" has no usable inverse`,
        });
      }

      if (mutation.operationName === 'update') {
        const rawAttributes = Reflect.get(
          inverseOperation,
          'encodedAttributes',
        );
        if (
          mutation.lastAppliedAt === null ||
          typeof rawAttributes !== 'object' ||
          rawAttributes === null ||
          Array.isArray(rawAttributes)
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-update-inverse-invalid',
            message: 'Update mutation inverse is incomplete',
          });
        }
        const attributes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawAttributes)) {
          const descriptor = encodedProperties[key];
          attributes[key] =
            descriptor?.kind === PrimitiveKind.Date && typeof value === 'string'
              ? new Date(value)
              : value;
        }
        await props.tx
          .update(resourceSchema)
          .set({ ...attributes, updatedAt: mutation.lastAppliedAt })
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        continue;
      }

      if (mutation.operationName === 'move') {
        const property = Reflect.get(inverseOperation, 'property');
        const prevId = Reflect.get(inverseOperation, 'prevId');
        if (
          mutation.lastAppliedAt === null ||
          typeof property !== 'string' ||
          typeof prevId !== 'string'
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-move-inverse-invalid',
            message: 'Move mutation inverse is incomplete',
          });
        }
        await props.tx
          .update(resourceSchema)
          .set({ [property]: prevId, updatedAt: mutation.lastAppliedAt })
          .where(sql`id = ${mutation.resourceId}`)
          .run();
        continue;
      }

      const rawResource = Reflect.get(inverseOperation, 'resource');
      if (
        typeof rawResource !== 'object' ||
        rawResource === null ||
        Array.isArray(rawResource)
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-journal-resource-inverse-invalid',
          message: `${mutation.operationName} mutation inverse is incomplete`,
        });
      }
      const convertedResource: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawResource)) {
        const descriptor = encodedProperties[key];
        convertedResource[key] =
          (key === 'createdAt' ||
            key === 'updatedAt' ||
            key === 'deletedAt' ||
            descriptor?.kind === PrimitiveKind.Date) &&
          typeof value === 'string'
            ? new Date(value)
            : value;
      }
      const resource = Schema.validateSync(EncodedResourceSchema)(
        convertedResource,
      );
      const existingResource = await props.tx
        .select()
        .from(resourceSchema)
        .where(sql`id = ${mutation.resourceId}`)
        .get();
      if (existingResource === undefined) {
        await props.tx.insert(resourceSchema).values(resource).run();
      } else {
        await props.tx
          .update(resourceSchema)
          .set(resource)
          .where(sql`id = ${mutation.resourceId}`)
          .run();
      }
    }
  }

  async replaceFromServer(
    frontendState: IAggregateFrontendSyncState,
    assertAuthorityCurrent: () => void,
  ): Promise<IAggregateFrontendReplicaState> {
    Schema.validateSync(AggregateFrontendSyncStateSchema)(frontendState, {
      onExcessProperty: 'error',
    });
    if (
      frontendState.systemId !== this.systemId ||
      frontendState.aggregateId !== this.catalogRow.aggregateId ||
      frontendState.aggregateName !== this.catalogRow.aggregateName ||
      frontendState.userId !== this.catalogRow.userId ||
      frontendState.frontendName !== this.catalogRow.frontendName
    ) {
      throw new ZerospinError({
        code: 'aggregate-frontend-replica-state-target-mismatch',
        message: 'Authoritative aggregate state targets another replica',
      });
    }
    assertAuthorityCurrent();

    if (this.status === 'activating') {
      await this.runtime.runPromise(
        makeTxAsync({
          db: this.db,
          program: ({ tx }) =>
            Effect.tryPromise({
              try: async () => {
                assertAuthorityCurrent();
                const metadata = await tx
                  .select()
                  .from(aggregateFrontendReplicaMetadata)
                  .where(
                    eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .get();
                if (metadata !== undefined) {
                  throw new ZerospinError({
                    code: 'browser-persistence-reset-required',
                    message:
                      'The activating aggregate exact database already has metadata',
                  });
                }
                for (const resource of frontendState.resources) {
                  const decodedResource = Schema.validateSync(
                    EncodedResourceSchema,
                  )(resource);
                  const resourceSchema =
                    this.resourceSchemas[decodedResource.modelName];
                  if (resourceSchema === undefined) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-replica-resource-model-missing',
                      message:
                        'Authoritative aggregate state contains an unknown resource model',
                    });
                  }
                  await tx.insert(resourceSchema).values(decodedResource).run();
                }
                await tx
                  .insert(aggregateFrontendReplicaMetadata)
                  .values({
                    id: this.catalogRow.id,
                    replicaIndex: 0,
                    frontendIndex: frontendState.frontendIndex,
                    systemVersion: frontendState.systemVersion,
                  })
                  .run();
                assertAuthorityCurrent();
              },
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'aggregate-frontend-replica-initial-install-failed',
                      message:
                        'Failed to install the initial exact aggregate replica',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            }),
        }),
      );
      this.catalogRow.replicaIndex = 0;
      this.catalogRow.frontendIndex = frontendState.frontendIndex;
      this.catalogRow.systemVersion = frontendState.systemVersion;
      this.onlineReplacementInstalled = true;
      this.status = 'ready';
      return {
        ...(await this.getSnapshot()),
        executedPushedCommands: frontendState.executedPushedCommands,
        failedPushedCommands: frontendState.failedPushedCommands,
      };
    }

    await this.runtime.runPromise(
      makeTxAsync({
        db: this.db,
        program: ({ tx }) =>
          Effect.tryPromise({
            try: async () => {
              assertAuthorityCurrent();
              const metadata = await tx
                .select()
                .from(aggregateFrontendReplicaMetadata)
                .where(
                  eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                )
                .get();
              if (metadata === undefined) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-replica-metadata-missing',
                  message: 'Aggregate replacement requires committed metadata',
                });
              }
              const journalRows = await tx
                .select()
                .from(aggregateFrontendCommandJournal)
                .all();
              const journal = journalRows
                .map(row => ({
                  row,
                  command: Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Union(
                        StagedReplicaCommandSchema,
                        PushedCommandSchema,
                      ),
                    ),
                  )(row.command, { onExcessProperty: 'error' }),
                  mutations: Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Array(EncodedAggregateFrontendMutationSchema),
                    ),
                  )(row.mutations, { onExcessProperty: 'error' }),
                  appliedMutationInverses: Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Array(EncodedAppliedMutationSchema),
                    ),
                  )(row.appliedMutationInverses, {
                    onExcessProperty: 'error',
                  }),
                }))
                .sort(
                  (left, right) =>
                    left.command.replicaIndex - right.command.replicaIndex,
                );
              const classifications = [
                ...frontendState.pushedCommands,
                ...frontendState.executedPushedCommands,
                ...frontendState.failedPushedCommands,
              ];
              const classificationById = new Map<
                string,
                (typeof classifications)[number]
              >();
              for (const command of classifications) {
                if (classificationById.has(command.id)) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-repair-classification-duplicate',
                    message:
                      'Authoritative aggregate repair sets must be disjoint',
                  });
                }
                classificationById.set(command.id, command);
              }
              for (const entry of journal) {
                const classification = classificationById.get(entry.command.id);
                if (
                  entry.command.status === 'pushed' &&
                  classification === undefined
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-repair-pushed-command-missing',
                    message:
                      'Authoritative aggregate repair omitted an active pushed command',
                  });
                }
                if (classification === undefined) continue;
                const entryStableBytes = Schema.encodeUnknownSync(
                  Schema.parseJson(StagedReplicaCommandSchema),
                )(
                  {
                    ...entry.command,
                    pushedCursor: null,
                    status: 'staged',
                  },
                  { onExcessProperty: 'ignore' },
                );
                const classificationStableBytes = Schema.encodeUnknownSync(
                  Schema.parseJson(StagedReplicaCommandSchema),
                )(
                  {
                    ...classification,
                    pushedCursor: null,
                    status: 'staged',
                  },
                  { onExcessProperty: 'ignore' },
                );
                if (entryStableBytes !== classificationStableBytes) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-repair-command-bytes-conflict',
                    message:
                      'Authoritative aggregate repair changed stable replica-command bytes',
                  });
                }
              }

              for (const entry of [...journal].reverse()) {
                await this.reverseEncodedMutations({
                  tx,
                  mutations: entry.appliedMutationInverses,
                });
              }

              await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
              for (const resourceSchema of Object.values(
                this.resourceSchemas,
              ).reverse()) {
                await tx.delete(resourceSchema).run();
              }
              for (const resource of frontendState.resources) {
                Schema.validateSync(EncodedResourceSchema)(resource);
                const resourceSchema = this.resourceSchemas[resource.modelName];
                if (resourceSchema === undefined) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-replica-resource-model-missing',
                    message:
                      'Aggregate resource model "' +
                      resource.modelName +
                      '" is not in the acquired spec',
                  });
                }
                await tx.insert(resourceSchema).values(resource).run();
              }

              for (const entry of journal) {
                const classification = classificationById.get(entry.command.id);
                if (
                  classification !== undefined &&
                  classification.status !== 'pushed'
                ) {
                  await tx
                    .delete(aggregateFrontendCommandJournal)
                    .where(
                      eq(
                        aggregateFrontendCommandJournal.commandId,
                        entry.command.id,
                      ),
                    )
                    .run();
                  continue;
                }
                const command = classification ?? entry.command;
                const applied = await this.applyEncodedMutations({
                  tx,
                  commandId: entry.command.id,
                  mutations: entry.mutations,
                  appliedAt: new Date(),
                });
                await tx
                  .update(aggregateFrontendCommandJournal)
                  .set({
                    command: Schema.encodeUnknownSync(
                      Schema.parseJson(
                        Schema.Union(
                          StagedReplicaCommandSchema,
                          PushedCommandSchema,
                        ),
                      ),
                    )(command, { onExcessProperty: 'error' }),
                    appliedMutationInverses: Schema.encodeUnknownSync(
                      Schema.parseJson(
                        Schema.Array(EncodedAppliedMutationSchema),
                      ),
                    )(applied.appliedMutations, {
                      onExcessProperty: 'error',
                    }),
                  })
                  .where(
                    eq(
                      aggregateFrontendCommandJournal.commandId,
                      entry.command.id,
                    ),
                  )
                  .run();
              }

              const replicaIndex = metadata.replicaIndex + 1;
              if (!Number.isSafeInteger(replicaIndex)) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-replica-index-exhausted',
                  message:
                    'Aggregate frontend replica index exceeded the safe integer range',
                });
              }
              await tx
                .update(aggregateFrontendReplicaMetadata)
                .set({
                  replicaIndex,
                  frontendIndex: frontendState.frontendIndex,
                  systemVersion: frontendState.systemVersion,
                })
                .where(
                  eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                )
                .run();
              assertAuthorityCurrent();
            },
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'replace-aggregate-frontend-replica-failed',
                    message: 'Failed to replace aggregate frontend replica',
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          }).pipe(Effect.withSpan('replaceAggregateReplicaFromServer')),
      }),
    );
    this.catalogRow.replicaIndex += 1;
    this.catalogRow.frontendIndex = frontendState.frontendIndex;
    this.catalogRow.systemVersion = frontendState.systemVersion;
    this.onlineReplacementInstalled = true;
    this.status = 'ready';
    return {
      ...(await this.getSnapshot()),
      executedPushedCommands: frontendState.executedPushedCommands,
      failedPushedCommands: frontendState.failedPushedCommands,
    };
  }

  async acquire(props: {
    sink: AggregateFrontendReplicaSinkApi;
    getAuthenticatedApi(props: {
      freshness: 'current' | 'refresh-if-current' | 'force';
      failedAuthenticatedApi:
        | Effect.Effect.Success<
            ReturnType<typeof authenticate>
          >['authenticatedApi']
        | null;
    }): Promise<Effect.Effect.Success<ReturnType<typeof authenticate>>>;
    getCurrentAuthenticatedApi():
      | Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi']
      | null;
    mode: 'online' | 'existing-only';
    ownerToken: object;
  }): Promise<
    Readonly<{ registrationId: string; registrationWasExisting: boolean }>
  > {
    if (this.status === 'failed') {
      throw this.lastFailure === null
        ? new ZerospinError({
            code: 'aggregate-frontend-replica-failed',
            message:
              'The exact aggregate frontend replica has terminally failed',
          })
        : ZerospinError.parse(this.lastFailure);
    }
    const existing = this.registrations.find(
      registration =>
        registration.ownerToken === props.ownerToken && !registration.released,
    );
    if (existing !== undefined) {
      if (props.mode === 'online') {
        existing.mode = 'online';
        existing.getAuthenticatedApi = props.getAuthenticatedApi;
        existing.getCurrentAuthenticatedApi = props.getCurrentAuthenticatedApi;
      }
      if (props.sink instanceof RpcStub && props.sink !== existing.sink) {
        props.sink[Symbol.dispose]();
      }
      if (props.mode === 'online' && this.status === 'ready') {
        setTimeout(() => {
          void this.connectSocket();
          void this.pushJournalCommands().catch(() => undefined);
        }, 0);
      }
      return {
        registrationId: existing.id,
        registrationWasExisting: true,
      };
    }

    const registrationId = `aggregate-registration-${this.allocateRegistrationId()}`;
    const capturedSnapshot =
      this.status === 'activating' ||
      (props.mode === 'online' && this.requiresOnlineReplacement())
        ? null
        : await this.getSnapshot();
    const retainedSink =
      props.sink instanceof RpcStub ? props.sink.dup() : props.sink;
    this.registrations.push({
      id: registrationId,
      sink: retainedSink,
      getAuthenticatedApi: props.getAuthenticatedApi,
      getCurrentAuthenticatedApi: props.getCurrentAuthenticatedApi,
      mode: props.mode,
      ownerToken: props.ownerToken,
      gateOpen: false,
      stateRequested: false,
      capturedSnapshot,
      bufferedBlocks: [],
      released: false,
    });

    if (props.mode === 'online' && this.status === 'ready') {
      setTimeout(() => {
        void this.connectSocket();
        void this.pushJournalCommands().catch(() => undefined);
      }, 0);
    }
    return { registrationId, registrationWasExisting: false };
  }

  async getAcquiredState(
    registrationId: string,
  ): Promise<IAggregateFrontendReplicaState> {
    return this.serialize(async () => {
      const registration = this.registrations.find(
        candidate => candidate.id === registrationId && !candidate.released,
      );
      if (registration === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-acquisition-released',
          message: 'Aggregate frontend replica acquisition is released',
        });
      }
      if (registration.stateRequested) return this.getSnapshot();
      registration.stateRequested = true;
      const capturedSnapshot =
        registration.capturedSnapshot ?? (await this.getSnapshot());
      setTimeout(() => {
        void this.serialize(async () => {
          if (registration.released) return;
          registration.gateOpen = true;
          const bufferedBlocks = registration.bufferedBlocks;
          registration.bufferedBlocks = [];
          for (const block of bufferedBlocks) {
            try {
              await this.runtime.runPromise(
                decodeRpc(await registration.sink.handleBlock(block)),
              );
            } catch {
              try {
                await this.runtime.runPromise(
                  decodeRpc(
                    await registration.sink.replaceState(
                      await this.getSnapshot(),
                    ),
                  ),
                );
              } catch {
                void this.release(registration.id);
                break;
              }
            }
          }
        });
      }, 0);
      return capturedSnapshot;
    });
  }

  async release(registrationId: string): Promise<void> {
    const registration = this.registrations.find(
      candidate => candidate.id === registrationId,
    );
    if (registration === undefined || registration.released) return;
    registration.released = true;
    const selectedAuthority =
      this.installedAuthority?.registrationId === registration.id &&
      this.installedAuthority.ownerToken === registration.ownerToken
        ? this.installedAuthority
        : null;
    if (selectedAuthority !== null) {
      this.authoritySelectionAttempt = {};
      this.authoritySelectionPromise = null;
      this.installedAuthority = null;
      this.onlineReplacementInstalled = false;
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      if (this.reconnectFiber !== null) {
        this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
        this.reconnectFiber = null;
      }
      this.socketState = 'disconnected';
      selectedAuthority.frontendApi[Symbol.dispose]();
    }
    await this.serialize(async () => {
      const registrationIndex = this.registrations.findIndex(
        candidate => candidate.id === registrationId,
      );
      if (registrationIndex === -1) return;
      const releasedRegistration = this.registrations[registrationIndex];
      if (releasedRegistration === undefined) return;
      if (releasedRegistration.sink instanceof RpcStub) {
        releasedRegistration.sink[Symbol.dispose]();
      }
      releasedRegistration.bufferedBlocks = [];
      this.registrations.splice(registrationIndex, 1);
      const hasOnlineRegistration = this.registrations.some(
        candidate => !candidate.released && candidate.mode === 'online',
      );
      if (!hasOnlineRegistration) {
        this.authoritySelectionAttempt = {};
        this.authoritySelectionPromise = null;
        const authority = this.installedAuthority;
        this.installedAuthority = null;
        this.onlineReplacementInstalled = false;
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        if (this.reconnectFiber !== null) {
          this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        this.socketState = 'disconnected';
        authority?.frontendApi[Symbol.dispose]();
        return;
      }
      if (selectedAuthority !== null) {
        setTimeout(() => {
          void this.repairFromRegistration({
            forceFresh: true,
            replaceState: true,
          }).catch(() => undefined);
        }, 0);
      }
    });
  }

  async releaseOwner(ownerToken: object): Promise<void> {
    for (const registration of this.registrations.filter(
      candidate => candidate.ownerToken === ownerToken && !candidate.released,
    )) {
      await this.release(registration.id);
    }
  }

  async fanoutBlock(block: IAggregateFrontendReplicaBlock): Promise<void> {
    if (
      block.systemId !== this.systemId ||
      block.aggregateId !== this.catalogRow.aggregateId ||
      block.aggregateName !== this.catalogRow.aggregateName ||
      block.userId !== this.catalogRow.userId ||
      block.frontendName !== this.catalogRow.frontendName ||
      block.aggregateFrontendLockKey !==
        this.catalogRow.aggregateFrontendLockKey
    ) {
      throw new ZerospinError({
        code: 'aggregate-frontend-replica-envelope-target-mismatch',
        message:
          'Aggregate replica envelope does not match this target and lock materialization',
      });
    }
    for (const registration of this.registrations) {
      if (registration.released) continue;
      if (!registration.gateOpen) {
        registration.bufferedBlocks.push(block);
        continue;
      }
      try {
        await this.runtime.runPromise(
          decodeRpc(await registration.sink.handleBlock(block)),
        );
      } catch {
        try {
          await this.runtime.runPromise(
            decodeRpc(
              await registration.sink.replaceState(await this.getSnapshot()),
            ),
          );
        } catch {
          void this.release(registration.id);
        }
      }
    }
  }

  async fanoutReplacement(
    state: IAggregateFrontendReplicaState,
  ): Promise<void> {
    if (
      state.systemId !== this.systemId ||
      state.aggregateId !== this.catalogRow.aggregateId ||
      state.aggregateName !== this.catalogRow.aggregateName ||
      state.userId !== this.catalogRow.userId ||
      state.frontendName !== this.catalogRow.frontendName ||
      state.aggregateFrontendLockKey !==
        this.catalogRow.aggregateFrontendLockKey
    ) {
      throw new ZerospinError({
        code: 'aggregate-frontend-replica-envelope-target-mismatch',
        message:
          'Aggregate replica state does not match this target and lock materialization',
      });
    }
    for (const registration of this.registrations) {
      if (registration.released || !registration.gateOpen) continue;
      try {
        await this.runtime.runPromise(
          decodeRpc(await registration.sink.replaceState(state)),
        );
      } catch {
        void this.release(registration.id);
      }
    }
  }

  async repairFromRegistration(props?: {
    excludedOwnerToken?: object | null;
    refreshAuthority?: boolean;
    forceFresh?: boolean;
    replaceState?: boolean;
  }): Promise<void> {
    if (this.status === 'failed') {
      throw this.lastFailure === null
        ? new ZerospinError({
            code: 'aggregate-frontend-replica-failed',
            message:
              'The exact aggregate frontend replica has terminally failed',
          })
        : ZerospinError.parse(this.lastFailure);
    }
    const replaceState = props?.replaceState !== false;
    if (replaceState) {
      this.onlineReplacementInstalled = false;
      const socket = this.socket;
      this.socket = null;
      socket?.close();
      if (this.reconnectFiber !== null) {
        this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
        this.reconnectFiber = null;
      }
      this.socketState = 'disconnected';
    }
    if (this.authoritySelectionPromise !== null) {
      await this.authoritySelectionPromise;
      if (replaceState && !this.onlineReplacementInstalled) {
        return this.repairFromRegistration(props);
      }
      return;
    }

    const selectionAttempt = {};
    this.authoritySelectionAttempt = selectionAttempt;
    const operation = (async () => {
      const expectedLock = Schema.decodeUnknownSync(
        Schema.parseJson(AggregateFrontendLockSchema),
      )(this.catalogRow.aggregateFrontendLock, {
        onExcessProperty: 'error',
      });
      const encodedExpectedLock = Schema.encodeUnknownSync(
        Schema.parseJson(AggregateFrontendLockSchema),
      )(expectedLock, { onExcessProperty: 'error' });
      const encodedExpectedSpec = Schema.encodeUnknownSync(
        Schema.parseJson(aggregateFrontendSpecSchema),
      )(this.frontendSpec, { onExcessProperty: 'error' });
      const attemptedSelections = new Set<string>();
      const excludedOwnerTokens = new Set<object>();
      if (
        props?.excludedOwnerToken !== undefined &&
        props.excludedOwnerToken !== null
      ) {
        excludedOwnerTokens.add(props.excludedOwnerToken);
      }
      let lastFailure: unknown;
      let detachedAuthority: Readonly<{
        registrationId: string;
        ownerToken: object;
        authenticatedApi: Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi'];
        frontendApi: Parameters<
          typeof fetchAggregateFrontendState
        >[0]['frontendApi'];
      }> | null = null;
      let failedAuthority: Readonly<{
        registrationId: string;
        ownerToken: object;
        authenticatedApi: Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi'];
        frontendApi: Parameters<
          typeof fetchAggregateFrontendState
        >[0]['frontendApi'];
      }> | null = null;
      let forceFresh = props?.forceFresh === true;

      try {
        const currentAuthority = this.installedAuthority;
        const currentRegistration =
          currentAuthority === null
            ? undefined
            : this.registrations.find(
                registration =>
                  registration.id === currentAuthority.registrationId &&
                  registration.ownerToken === currentAuthority.ownerToken &&
                  !registration.released &&
                  registration.mode === 'online',
              );
        let selectedAuthority =
          props?.refreshAuthority !== true &&
          !forceFresh &&
          currentAuthority !== null &&
          currentRegistration !== undefined &&
          !excludedOwnerTokens.has(currentAuthority.ownerToken) &&
          currentAuthority.authenticatedApi ===
            currentRegistration.getCurrentAuthenticatedApi()
            ? currentAuthority
            : null;
        let selectedFreshness:
          | 'current'
          | 'refresh-if-current'
          | 'force'
          | null = selectedAuthority === null ? null : 'current';

        if (selectedAuthority === null && currentAuthority !== null) {
          detachedAuthority = currentAuthority;
          failedAuthority = currentAuthority;
          this.installedAuthority = null;
          if (replaceState) this.onlineReplacementInstalled = false;
          const socket = this.socket;
          this.socket = null;
          socket?.close();
          this.socketState = 'disconnected';
        }
        if (replaceState && this.status === 'ready') {
          this.status = 'repairing';
        }

        while (true) {
          if (this.authoritySelectionAttempt !== selectionAttempt) {
            throw new ZerospinError({
              code: 'aggregate-frontend-authority-selection-stale',
              message: 'Aggregate frontend authority selection was superseded',
            });
          }

          if (selectedAuthority === null) {
            const preferredRegistration =
              failedAuthority === null
                ? undefined
                : this.registrations.find(
                    registration =>
                      registration.id === failedAuthority?.registrationId &&
                      registration.ownerToken === failedAuthority.ownerToken &&
                      !registration.released &&
                      registration.mode === 'online',
                  );
            const registrations = [
              ...(preferredRegistration === undefined
                ? []
                : [preferredRegistration]),
              ...this.registrations.filter(
                registration =>
                  registration !== preferredRegistration &&
                  !registration.released &&
                  registration.mode === 'online',
              ),
            ];

            for (const registration of registrations) {
              if (excludedOwnerTokens.has(registration.ownerToken)) continue;
              const freshness =
                failedAuthority !== null &&
                registration.id === failedAuthority.registrationId &&
                registration.ownerToken === failedAuthority.ownerToken
                  ? 'refresh-if-current'
                  : forceFresh || failedAuthority !== null
                    ? 'force'
                    : 'current';
              const selectionKey = `${registration.id}/${freshness}`;
              if (attemptedSelections.has(selectionKey)) continue;
              attemptedSelections.add(selectionKey);

              let candidateFrontendApi:
                | Parameters<
                    typeof fetchAggregateFrontendState
                  >[0]['frontendApi']
                | null = null;
              try {
                const authenticated = await registration.getAuthenticatedApi({
                  freshness,
                  failedAuthenticatedApi:
                    freshness === 'refresh-if-current' &&
                    failedAuthority !== null
                      ? failedAuthority.authenticatedApi
                      : null,
                });
                if (
                  this.authoritySelectionAttempt !== selectionAttempt ||
                  registration.released ||
                  registration.mode !== 'online' ||
                  !this.registrations.includes(registration) ||
                  authenticated.authenticatedApi !==
                    registration.getCurrentAuthenticatedApi()
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-registration-authorization-stale',
                    message:
                      'Aggregate frontend parent authorization changed before child acquisition',
                  });
                }
                if (
                  authenticated.systemId !== this.systemId ||
                  authenticated.userId !== this.catalogRow.userId ||
                  authenticated.systemName !== this.systemName
                ) {
                  throw new ZerospinError({
                    code: 'shared-worker-authenticated-user-identity-mismatch',
                    message:
                      'Aggregate frontend authority belongs to another bound user partition',
                  });
                }

                candidateFrontendApi =
                  await authenticated.authenticatedApi.getAggregateFrontendApi({
                    aggregateId: this.catalogRow.aggregateId,
                    aggregateName: this.catalogRow.aggregateName,
                    frontendName: this.catalogRow.frontendName,
                    aggregateFrontendLock: expectedLock,
                  });
                const decodedAdmission = await this.runtime.runPromise(
                  decodeRpc(await candidateFrontendApi.getAdmission()).pipe(
                    Effect.either,
                  ),
                );
                if (Either.isLeft(decodedAdmission)) {
                  throw decodedAdmission.left;
                }
                const admitted = Schema.decodeUnknownSync(
                  Schema.Struct({
                    actorRef: Schema.Struct({
                      aggregateId: Schema.String,
                      aggregateName: Schema.String,
                      userId: Schema.String,
                    }),
                    aggregateFrontendLock: AggregateFrontendLockSchema,
                    frontendName: Schema.String,
                    frontendSpec: aggregateFrontendSpecSchema,
                    systemId: Schema.String,
                    systemVersion: Schema.String,
                  }),
                )(decodedAdmission.right, { onExcessProperty: 'error' });
                const admittedLockKey = await this.runtime.runPromise(
                  makeAggregateFrontendLockKey(admitted.aggregateFrontendLock),
                );
                const encodedAdmittedLock = Schema.encodeUnknownSync(
                  Schema.parseJson(AggregateFrontendLockSchema),
                )(admitted.aggregateFrontendLock, {
                  onExcessProperty: 'error',
                });
                const encodedAdmittedSpec = Schema.encodeUnknownSync(
                  Schema.parseJson(aggregateFrontendSpecSchema),
                )(admitted.frontendSpec, { onExcessProperty: 'error' });
                let frontendSpecMismatchIndex = 0;
                while (
                  frontendSpecMismatchIndex < encodedAdmittedSpec.length &&
                  frontendSpecMismatchIndex < encodedExpectedSpec.length &&
                  encodedAdmittedSpec[frontendSpecMismatchIndex] ===
                    encodedExpectedSpec[frontendSpecMismatchIndex]
                ) {
                  frontendSpecMismatchIndex += 1;
                }
                const admissionMismatches = [
                  admitted.systemId !== this.systemId ? 'systemId' : null,
                  admitted.actorRef.aggregateId !== this.catalogRow.aggregateId
                    ? 'actorRef.aggregateId'
                    : null,
                  admitted.actorRef.aggregateName !==
                  this.catalogRow.aggregateName
                    ? 'actorRef.aggregateName'
                    : null,
                  admitted.actorRef.userId !== this.catalogRow.userId
                    ? 'actorRef.userId'
                    : null,
                  admitted.frontendName !== this.catalogRow.frontendName
                    ? 'frontendName'
                    : null,
                  admitted.frontendSpec.kind !== 'aggregate'
                    ? 'frontendSpec.kind'
                    : null,
                  admitted.frontendSpec.aggregateName !==
                  this.catalogRow.aggregateName
                    ? 'frontendSpec.aggregateName'
                    : null,
                  admitted.frontendSpec.frontendName !==
                  this.catalogRow.frontendName
                    ? 'frontendSpec.frontendName'
                    : null,
                  encodedAdmittedLock !== encodedExpectedLock
                    ? 'aggregateFrontendLock'
                    : null,
                  admittedLockKey !== this.catalogRow.aggregateFrontendLockKey
                    ? 'aggregateFrontendLockKey'
                    : null,
                  encodedAdmittedSpec !== encodedExpectedSpec
                    ? 'frontendSpec'
                    : null,
                ].filter(mismatch => mismatch !== null);
                if (admissionMismatches.length > 0) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-admission-target-mismatch',
                    message: `Worker-owned aggregate frontend admission does not match the exact replica request: ${admissionMismatches.join(', ')}${encodedAdmittedSpec === encodedExpectedSpec ? '' : ` at byte ${frontendSpecMismatchIndex}; expected ${JSON.stringify(encodedExpectedSpec.slice(Math.max(0, frontendSpecMismatchIndex - 40), frontendSpecMismatchIndex + 80))}; received ${JSON.stringify(encodedAdmittedSpec.slice(Math.max(0, frontendSpecMismatchIndex - 40), frontendSpecMismatchIndex + 80))}`}`,
                    extra: { registrationAdmissionRejected: true },
                  });
                }
                if (
                  this.authoritySelectionAttempt !== selectionAttempt ||
                  registration.released ||
                  registration.mode !== 'online' ||
                  !this.registrations.includes(registration) ||
                  authenticated.authenticatedApi !==
                    registration.getCurrentAuthenticatedApi()
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-registration-authorization-stale',
                    message:
                      'Aggregate frontend parent authorization changed during child admission',
                  });
                }

                const installedAuthority = {
                  registrationId: registration.id,
                  ownerToken: registration.ownerToken,
                  authenticatedApi: authenticated.authenticatedApi,
                  frontendApi: candidateFrontendApi,
                };
                this.installedAuthority = installedAuthority;
                selectedAuthority = installedAuthority;
                selectedFreshness = freshness;
                candidateFrontendApi = null;
                if (
                  detachedAuthority !== null &&
                  detachedAuthority.frontendApi !==
                    installedAuthority.frontendApi
                ) {
                  detachedAuthority.frontendApi[Symbol.dispose]();
                }
                detachedAuthority = null;
                break;
              } catch (cause) {
                candidateFrontendApi?.[Symbol.dispose]();
                if (this.authoritySelectionAttempt !== selectionAttempt) {
                  throw cause;
                }
                if (
                  ZerospinError.isZerospinError(cause) &&
                  (cause.code === 'aggregate-frontend-lock-unsupported' ||
                    cause.extra?.registrationAdmissionRejected === true)
                ) {
                  throw cause;
                }
                lastFailure = cause;
                excludedOwnerTokens.add(registration.ownerToken);
                forceFresh = failedAuthority !== null || forceFresh;
              }
            }

            if (selectedAuthority === null) {
              detachedAuthority?.frontendApi[Symbol.dispose]();
              detachedAuthority = null;
              this.installedAuthority = null;
              if (replaceState) this.onlineReplacementInstalled = false;
              const failure = ZerospinError.isZerospinError(lastFailure)
                ? lastFailure
                : new ZerospinError({
                    code: 'aggregate-frontend-authority-unavailable',
                    message:
                      'No online aggregate registration currently owns a usable authority',
                    cause: ZerospinError.prettyUnknownFailure(lastFailure),
                  });
              this.lastFailure = ZerospinError.stringify(failure);
              if (this.status === 'activating') throw failure;
              this.status = 'ready';
              this.socketState = 'disconnected';
              return;
            }
          }

          if (!replaceState) {
            this.lastFailure = null;
            this.socketState = 'disconnected';
            return;
          }
          const capturedAuthority = selectedAuthority;
          const capturedRegistration = this.registrations.find(
            registration =>
              registration.id === capturedAuthority.registrationId &&
              registration.ownerToken === capturedAuthority.ownerToken &&
              !registration.released &&
              registration.mode === 'online',
          );
          if (
            capturedRegistration === undefined ||
            this.installedAuthority !== capturedAuthority ||
            this.authoritySelectionAttempt !== selectionAttempt ||
            capturedAuthority.authenticatedApi !==
              capturedRegistration.getCurrentAuthenticatedApi()
          ) {
            throw new ZerospinError({
              code: 'aggregate-frontend-registration-stale',
              message:
                'Aggregate frontend authority changed before state invocation',
            });
          }

          const capturedFrontendIndex =
            this.status === 'activating' ? null : this.catalogRow.frontendIndex;
          const capturedReplicaIndex =
            this.status === 'activating' ? null : this.catalogRow.replicaIndex;
          let frontendState: IAggregateFrontendSyncState;
          try {
            const fetched = await this.authenticationRuntime.runPromise(
              fetchAggregateFrontendState({
                frontendApi: capturedAuthority.frontendApi,
              }).pipe(Effect.either),
            );
            if (Either.isLeft(fetched)) throw fetched.left;
            if (
              this.installedAuthority !== capturedAuthority ||
              this.authoritySelectionAttempt !== selectionAttempt ||
              capturedRegistration.released ||
              !this.registrations.includes(capturedRegistration) ||
              capturedAuthority.ownerToken !==
                capturedRegistration.ownerToken ||
              capturedAuthority.authenticatedApi !==
                capturedRegistration.getCurrentAuthenticatedApi()
            ) {
              throw new ZerospinError({
                code: 'aggregate-frontend-registration-stale',
                message:
                  'Aggregate frontend authority changed during state acquisition',
              });
            }
            frontendState = fetched.right;
          } catch (cause) {
            if (
              ZerospinError.isZerospinError(cause) &&
              (cause.code === 'aggregate-frontend-lock-unsupported' ||
                cause.extra?.registrationAdmissionRejected === true)
            ) {
              throw cause;
            }
            lastFailure = cause;
            if (this.installedAuthority === capturedAuthority) {
              this.installedAuthority = null;
            }
            capturedAuthority.frontendApi[Symbol.dispose]();
            this.onlineReplacementInstalled = false;
            selectedAuthority = null;
            failedAuthority = capturedAuthority;
            if (selectedFreshness === 'current') {
              excludedOwnerTokens.delete(capturedAuthority.ownerToken);
            } else {
              excludedOwnerTokens.add(capturedAuthority.ownerToken);
              forceFresh = true;
            }
            continue;
          }

          let replacement: IAggregateFrontendReplicaState | undefined;
          let retryRequired = false;
          await this.serialize(async () => {
            if (
              this.installedAuthority !== capturedAuthority ||
              this.authoritySelectionAttempt !== selectionAttempt ||
              capturedRegistration.released ||
              !this.registrations.includes(capturedRegistration) ||
              capturedAuthority.registrationId !== capturedRegistration.id ||
              capturedAuthority.ownerToken !==
                capturedRegistration.ownerToken ||
              capturedAuthority.authenticatedApi !==
                capturedRegistration.getCurrentAuthenticatedApi()
            ) {
              throw new ZerospinError({
                code: 'aggregate-frontend-registration-stale',
                message:
                  'Aggregate frontend authority changed before replacement commit',
              });
            }
            if (
              capturedFrontendIndex !== null &&
              capturedReplicaIndex !== null &&
              (this.catalogRow.frontendIndex !== capturedFrontendIndex ||
                this.catalogRow.replicaIndex !== capturedReplicaIndex)
            ) {
              retryRequired = true;
              return;
            }
            replacement = await this.replaceFromServer(frontendState, () => {
              if (
                this.installedAuthority !== capturedAuthority ||
                this.authoritySelectionAttempt !== selectionAttempt ||
                capturedRegistration.released ||
                !this.registrations.includes(capturedRegistration) ||
                capturedAuthority.registrationId !== capturedRegistration.id ||
                capturedAuthority.ownerToken !==
                  capturedRegistration.ownerToken ||
                capturedAuthority.authenticatedApi !==
                  capturedRegistration.getCurrentAuthenticatedApi()
              ) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-registration-stale',
                  message:
                    'Aggregate frontend authority changed during replacement commit',
                });
              }
            });
          });
          if (retryRequired) continue;
          if (replacement !== undefined) {
            await this.fanoutReplacement(replacement);
          }
          this.lastFailure = null;
          setTimeout(() => {
            void this.connectSocket();
            void this.pushJournalCommands().catch(() => undefined);
          }, 0);
          return;
        }
      } catch (cause) {
        detachedAuthority?.frontendApi[Symbol.dispose]();
        if (
          ZerospinError.isZerospinError(cause) &&
          (cause.code === 'aggregate-frontend-lock-unsupported' ||
            cause.extra?.registrationAdmissionRejected === true)
        ) {
          this.authoritySelectionAttempt = {};
          const authority = this.installedAuthority;
          this.installedAuthority = null;
          this.onlineReplacementInstalled = false;
          const socket = this.socket;
          this.socket = null;
          socket?.close();
          if (this.reconnectFiber !== null) {
            this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
            this.reconnectFiber = null;
          }
          this.socketState = 'disconnected';
          authority?.frontendApi[Symbol.dispose]();
          this.status = 'failed';
          this.lastFailure = ZerospinError.stringify(cause);
          const publicFailure = Schema.encodeUnknownSync(ZerospinError.schema)(
            cause,
          );
          for (const registration of this.registrations) {
            if (registration.released) continue;
            try {
              await this.runtime.runPromise(
                decodeRpc(await registration.sink.handleFailure(publicFailure)),
              );
            } catch {
              // The exact Repo remains terminal even when notification fails.
            }
          }
        } else if (
          this.status !== 'activating' &&
          this.authoritySelectionAttempt === selectionAttempt
        ) {
          this.status = 'ready';
          const failure = ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'aggregate-frontend-replica-repair-failed',
                message: 'Failed to repair the exact aggregate replica',
                cause: ZerospinError.prettyUnknownFailure(cause),
              });
          this.lastFailure = ZerospinError.stringify(failure);
        }
        throw cause;
      }
    })();
    this.authoritySelectionPromise = operation;
    try {
      await operation;
    } finally {
      if (this.authoritySelectionPromise === operation) {
        this.authoritySelectionPromise = null;
      }
    }
  }

  async scheduleReconnect(): Promise<void> {
    if (
      this.reconnectFiber !== null ||
      this.status !== 'ready' ||
      !this.registrations.some(
        registration =>
          !registration.released && registration.mode === 'online',
      )
    ) {
      return;
    }
    const reconnectAttempt = this.reconnectAttempt + 1;
    const delay = Math.min(30_000, 250 * 2 ** this.reconnectAttempt);
    this.socketState = 'disconnected';
    this.reconnectAttempt = reconnectAttempt;
    this.reconnectFiber = this.runtime.runFork(
      Effect.sleep(Duration.millis(delay)).pipe(
        Effect.andThen(Effect.promise(() => this.connectSocket())),
        Effect.catchAll(() => Effect.void),
        Effect.ensuring(
          Effect.sync(() => {
            this.reconnectFiber = null;
          }),
        ),
      ),
    );
  }

  async connectSocket(props?: {
    ticketRetriedOwnerToken?: object | null;
  }): Promise<void> {
    let replacementRequired = false;
    let stateReplacementRequired = false;
    let refreshAuthority = false;
    let excludedOwnerToken: object | null = null;
    let ticketRetriedOwnerToken: object | null = null;
    let refreshFailedAuthority: Readonly<{
      registrationId: string;
      ownerToken: object;
      authenticatedApi: Effect.Effect.Success<
        ReturnType<typeof authenticate>
      >['authenticatedApi'];
      frontendApi: Parameters<
        typeof fetchAggregateFrontendState
      >[0]['frontendApi'];
    }> | null = null;
    let terminalFailure: ZerospinError | null = null;
    await this.serialize(async () => {
      if (
        this.socket !== null ||
        this.socketState !== 'disconnected' ||
        this.authoritySelectionPromise !== null ||
        this.status !== 'ready' ||
        !this.registrations.some(
          registration =>
            !registration.released && registration.mode === 'online',
        )
      ) {
        return;
      }
      this.socketState = 'connecting';
      const authority = this.installedAuthority;
      const registration =
        authority === null
          ? undefined
          : this.registrations.find(
              candidate =>
                candidate.id === authority.registrationId &&
                candidate.ownerToken === authority.ownerToken &&
                !candidate.released &&
                candidate.mode === 'online',
            );
      if (!this.onlineReplacementInstalled) {
        replacementRequired = true;
        stateReplacementRequired = true;
        return;
      }
      if (
        authority === null ||
        registration === undefined ||
        authority.authenticatedApi !== registration.getCurrentAuthenticatedApi()
      ) {
        replacementRequired = true;
        refreshAuthority = authority !== null;
        refreshFailedAuthority = authority;
        this.authoritySelectionAttempt = {};
        this.authoritySelectionPromise = null;
        return;
      }
      const selectionAttempt = this.authoritySelectionAttempt;
      let ticket: Readonly<{ ticket: string }>;
      try {
        const created = await this.authenticationRuntime.runPromise(
          createAggregateFrontendWebSocketTicket({
            frontendApi: authority.frontendApi,
          }).pipe(Effect.either),
        );
        if (Either.isLeft(created)) throw created.left;
        ticket = created.right;
      } catch (cause) {
        if (
          ZerospinError.isZerospinError(cause) &&
          (cause.code === 'aggregate-frontend-lock-unsupported' ||
            cause.extra?.registrationAdmissionRejected === true)
        ) {
          terminalFailure = cause;
          this.authoritySelectionAttempt = {};
          this.authoritySelectionPromise = null;
          this.installedAuthority = null;
          this.onlineReplacementInstalled = false;
          this.status = 'failed';
          this.lastFailure = ZerospinError.stringify(cause);
          authority.frontendApi[Symbol.dispose]();
          this.socketState = 'disconnected';
          return;
        }
        const failure = ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'aggregate-frontend-websocket-ticket-failed',
              message:
                'The installed aggregate authority could not mint a ticket',
              cause: ZerospinError.prettyUnknownFailure(cause),
            });
        this.lastFailure = ZerospinError.stringify(failure);
        this.authoritySelectionAttempt = {};
        this.authoritySelectionPromise = null;
        replacementRequired = true;
        refreshAuthority = true;
        refreshFailedAuthority = authority;
        if (props?.ticketRetriedOwnerToken === authority.ownerToken) {
          excludedOwnerToken = authority.ownerToken;
        } else {
          ticketRetriedOwnerToken = authority.ownerToken;
        }
        return;
      }
      if (
        this.installedAuthority !== authority ||
        this.authoritySelectionAttempt !== selectionAttempt ||
        registration.released ||
        !this.registrations.includes(registration) ||
        authority.registrationId !== registration.id ||
        authority.ownerToken !== registration.ownerToken ||
        authority.authenticatedApi !== registration.getCurrentAuthenticatedApi()
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-registration-stale',
          message: 'Aggregate frontend authority changed before ticket use',
        });
      }

      const socketUrl = new URL(this.sharedWorkerApiUrl);
      if (socketUrl.protocol === 'https:') {
        socketUrl.protocol = 'wss:';
      } else if (socketUrl.protocol === 'http:') {
        socketUrl.protocol = 'ws:';
      } else {
        this.socketState = 'disconnected';
        throw new ZerospinError({
          code: 'aggregate-frontend-websocket-url-invalid',
          message: 'SharedWorker API URL must use http or https',
        });
      }
      socketUrl.pathname = '/ws-aggregate-frontend-blocks';
      socketUrl.search = '';
      socketUrl.searchParams.set('ticket', ticket.ticket);

      let socket: WebSocket;
      try {
        socket = new WebSocket(socketUrl.toString());
      } catch (cause) {
        const failure = new ZerospinError({
          code: 'aggregate-frontend-websocket-construction-failed',
          message: 'Failed to construct aggregate frontend WebSocket',
          cause: ZerospinError.prettyUnknownFailure(cause),
        });
        this.socketState = 'disconnected';
        this.lastFailure = ZerospinError.stringify(failure);
        await this.scheduleReconnect();
        return;
      }
      this.socket = socket;

      socket.addEventListener('open', () => {
        void this.serialize(async () => {
          if (
            this.socket !== socket ||
            this.installedAuthority !== authority ||
            this.authoritySelectionAttempt !== selectionAttempt ||
            registration.released ||
            !this.registrations.includes(registration) ||
            authority.registrationId !== registration.id ||
            authority.ownerToken !== registration.ownerToken ||
            authority.authenticatedApi !==
              registration.getCurrentAuthenticatedApi()
          ) {
            socket.close();
            return;
          }
          const snapshot = await this.getSnapshot();
          if (
            this.socket !== socket ||
            this.installedAuthority !== authority ||
            this.authoritySelectionAttempt !== selectionAttempt ||
            registration.released ||
            !this.registrations.includes(registration) ||
            authority.registrationId !== registration.id ||
            authority.ownerToken !== registration.ownerToken ||
            authority.authenticatedApi !==
              registration.getCurrentAuthenticatedApi()
          ) {
            socket.close();
            return;
          }
          this.socketState = 'replaying';
          socket.send(
            JSON.stringify({ frontendIndex: snapshot.frontendIndex }),
          );
        });
      });
      socket.addEventListener('message', event => {
        void (async () => {
          try {
            if (
              this.socket !== socket ||
              this.installedAuthority !== authority ||
              this.authoritySelectionAttempt !== selectionAttempt ||
              registration.released ||
              !this.registrations.includes(registration) ||
              authority.registrationId !== registration.id ||
              authority.ownerToken !== registration.ownerToken ||
              authority.authenticatedApi !==
                registration.getCurrentAuthenticatedApi()
            ) {
              return;
            }
            const message = Schema.decodeUnknownSync(
              aggregateFrontendSocketMessageSchema,
            )(String(event.data), { onExcessProperty: 'error' });
            if (message.type === 'aggregateFrontendBlock') {
              await this.applyServerBlock(message.sync, () => {
                if (
                  this.socket !== socket ||
                  this.installedAuthority !== authority ||
                  this.authoritySelectionAttempt !== selectionAttempt ||
                  registration.released ||
                  !this.registrations.includes(registration) ||
                  authority.registrationId !== registration.id ||
                  authority.ownerToken !== registration.ownerToken ||
                  authority.authenticatedApi !==
                    registration.getCurrentAuthenticatedApi()
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-socket-callback-stale',
                    message:
                      'Aggregate frontend socket callback no longer owns the installed capability tuple',
                  });
                }
              });
              return;
            }
            if (message.type === 'state-required') {
              await this.repairFromRegistration({ replaceState: true });
              socket.close();
              return;
            }
            await this.serialize(async () => {
              if (
                this.socket !== socket ||
                this.installedAuthority !== authority ||
                this.authoritySelectionAttempt !== selectionAttempt ||
                registration.released ||
                !this.registrations.includes(registration) ||
                authority.registrationId !== registration.id ||
                authority.ownerToken !== registration.ownerToken ||
                authority.authenticatedApi !==
                  registration.getCurrentAuthenticatedApi()
              ) {
                return;
              }
              const snapshot = await this.getSnapshot();
              if (
                this.socket !== socket ||
                this.installedAuthority !== authority ||
                this.authoritySelectionAttempt !== selectionAttempt ||
                registration.released ||
                !this.registrations.includes(registration) ||
                authority.registrationId !== registration.id ||
                authority.ownerToken !== registration.ownerToken ||
                authority.authenticatedApi !==
                  registration.getCurrentAuthenticatedApi() ||
                !Number.isSafeInteger(message.frontendIndex) ||
                message.frontendIndex !== snapshot.frontendIndex
              ) {
                throw new ZerospinError({
                  code: 'aggregate-frontend-websocket-replay-watermark-mismatch',
                  message:
                    'Replay completion does not match the committed aggregate watermark',
                });
              }
              this.socketState = 'online';
              this.reconnectAttempt = 0;
              this.lastFailure = null;
            });
            setTimeout(
              () => void this.pushJournalCommands().catch(() => undefined),
              0,
            );
          } catch {
            if (
              this.socket === socket &&
              this.installedAuthority === authority &&
              this.authoritySelectionAttempt === selectionAttempt &&
              !registration.released &&
              this.registrations.includes(registration) &&
              authority.registrationId === registration.id &&
              authority.ownerToken === registration.ownerToken &&
              authority.authenticatedApi ===
                registration.getCurrentAuthenticatedApi()
            ) {
              try {
                await this.repairFromRegistration({ replaceState: true });
              } catch {
                // A later same-lock capability reacquisition retries repair.
              }
            }
            socket.close();
          }
        })();
      });
      socket.addEventListener('error', () => socket.close());
      socket.addEventListener('close', event => {
        void (async () => {
          let generationTransition = false;
          await this.serialize(async () => {
            if (
              this.socket !== socket ||
              this.installedAuthority !== authority ||
              this.authoritySelectionAttempt !== selectionAttempt ||
              registration.released ||
              !this.registrations.includes(registration) ||
              authority.registrationId !== registration.id ||
              authority.ownerToken !== registration.ownerToken ||
              authority.authenticatedApi !==
                registration.getCurrentAuthenticatedApi()
            ) {
              return;
            }
            this.socket = null;
            if (this.status === 'failed') return;
            this.socketState = 'disconnected';
            generationTransition =
              event.code === 1012 && event.reason === 'generation-drained';
            if (generationTransition) {
              this.onlineReplacementInstalled = false;
            }
            if (!generationTransition) await this.scheduleReconnect();
          });
          if (!generationTransition) return;
          try {
            await this.repairFromRegistration({
              refreshAuthority: true,
              replaceState: true,
            });
            await this.connectSocket();
          } catch {
            await this.scheduleReconnect();
          }
        })();
      });
    });
    if (terminalFailure !== null) {
      const publicFailure = Schema.encodeUnknownSync(ZerospinError.schema)(
        terminalFailure,
      );
      for (const registration of this.registrations) {
        if (registration.released) continue;
        try {
          await this.runtime.runPromise(
            decodeRpc(await registration.sink.handleFailure(publicFailure)),
          );
        } catch {
          // The exact Repo remains terminal even when notification fails.
        }
      }
      return;
    }
    if (replacementRequired) {
      try {
        if (
          refreshFailedAuthority !== null &&
          this.installedAuthority !== null &&
          this.installedAuthority !== refreshFailedAuthority
        ) {
          this.socketState = 'disconnected';
          await this.connectSocket({ ticketRetriedOwnerToken });
          return;
        }
        await this.repairFromRegistration({
          excludedOwnerToken,
          refreshAuthority,
          forceFresh:
            excludedOwnerToken !== null ||
            (refreshFailedAuthority !== null &&
              this.installedAuthority === null),
          replaceState: stateReplacementRequired,
        });
        if (
          this.status !== 'ready' ||
          !this.onlineReplacementInstalled ||
          this.installedAuthority === null
        ) {
          await this.scheduleReconnect();
          return;
        }
        await this.connectSocket({ ticketRetriedOwnerToken });
      } catch {
        await this.scheduleReconnect();
      }
    }
  }

  async applyServerBlock(
    frontendBlock: IAggregateFrontendBlock,
    assertSourceCurrent: () => void,
  ): Promise<void> {
    Schema.validateSync(AggregateFrontendBlockSchema)(frontendBlock, {
      onExcessProperty: 'error',
    });
    let repairRequired = false;
    let committedBlock: IAggregateFrontendReplicaBlock | undefined;
    await this.serialize(async () => {
      assertSourceCurrent();
      const metadata = await this.db
        .select()
        .from(aggregateFrontendReplicaMetadata)
        .where(eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id))
        .get();
      if (metadata === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-metadata-missing',
          message: 'Canonical block application requires committed metadata',
        });
      }
      if (frontendBlock.frontendName !== this.catalogRow.frontendName) {
        throw new ZerospinError({
          code: 'aggregate-frontend-websocket-block-target-mismatch',
          message: 'Aggregate frontend block targets another replica',
        });
      }
      if (frontendBlock.frontendIndex <= metadata.frontendIndex) return;
      if (frontendBlock.frontendIndex !== metadata.frontendIndex + 1) {
        repairRequired = true;
        return;
      }

      await this.runtime.runPromise(
        makeTxAsync({
          db: this.db,
          program: ({ tx }) =>
            Effect.tryPromise({
              try: async () => {
                assertSourceCurrent();
                const liveMetadata = await tx
                  .select()
                  .from(aggregateFrontendReplicaMetadata)
                  .where(
                    eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .get();
                if (
                  liveMetadata === undefined ||
                  liveMetadata.frontendIndex !== metadata.frontendIndex ||
                  liveMetadata.replicaIndex !== metadata.replicaIndex
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-block-frontier-conflict',
                    message:
                      'Aggregate replica frontiers changed before canonical block commit',
                  });
                }

                const journalRows = await tx
                  .select()
                  .from(aggregateFrontendCommandJournal)
                  .all();
                const journal = journalRows
                  .map(row => ({
                    row,
                    command: Schema.decodeUnknownSync(
                      Schema.parseJson(
                        Schema.Union(
                          StagedReplicaCommandSchema,
                          PushedCommandSchema,
                        ),
                      ),
                    )(row.command, { onExcessProperty: 'error' }),
                    mutations: Schema.decodeUnknownSync(
                      Schema.parseJson(
                        Schema.Array(EncodedAggregateFrontendMutationSchema),
                      ),
                    )(row.mutations, { onExcessProperty: 'error' }),
                    appliedMutationInverses: Schema.decodeUnknownSync(
                      Schema.parseJson(
                        Schema.Array(EncodedAppliedMutationSchema),
                      ),
                    )(row.appliedMutationInverses, {
                      onExcessProperty: 'error',
                    }),
                  }))
                  .sort(
                    (left, right) =>
                      left.command.replicaIndex - right.command.replicaIndex,
                  );
                const classifications = [
                  ...frontendBlock.pendingPushedCommands,
                  ...frontendBlock.executedPushedCommands,
                  ...frontendBlock.failedPushedCommands,
                ];
                const classificationById = new Map<
                  string,
                  (typeof classifications)[number]
                >();
                for (const command of classifications) {
                  if (classificationById.has(command.id)) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-block-classification-duplicate',
                      message:
                        'Canonical aggregate block command sets must be disjoint',
                    });
                  }
                  classificationById.set(command.id, command);
                }
                for (const entry of journal) {
                  const classification = classificationById.get(
                    entry.command.id,
                  );
                  if (
                    entry.command.status === 'pushed' &&
                    classification === undefined
                  ) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-block-pushed-command-missing',
                      message:
                        'Canonical aggregate block omitted an active pushed command',
                    });
                  }
                  if (classification === undefined) continue;
                  const entryStableBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedReplicaCommandSchema),
                  )(
                    {
                      ...entry.command,
                      pushedCursor: null,
                      status: 'staged',
                    },
                    { onExcessProperty: 'ignore' },
                  );
                  const classificationStableBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedReplicaCommandSchema),
                  )(
                    {
                      ...classification,
                      pushedCursor: null,
                      status: 'staged',
                    },
                    { onExcessProperty: 'ignore' },
                  );
                  if (entryStableBytes !== classificationStableBytes) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-block-command-bytes-conflict',
                      message:
                        'Canonical aggregate block changed stable replica-command bytes',
                    });
                  }
                  if (
                    entry.command.status === 'pushed' &&
                    classification.status === 'pushed' &&
                    Schema.encodeUnknownSync(
                      Schema.parseJson(PushedCommandSchema),
                    )(entry.command, { onExcessProperty: 'error' }) !==
                      Schema.encodeUnknownSync(
                        Schema.parseJson(PushedCommandSchema),
                      )(classification, { onExcessProperty: 'error' })
                  ) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-block-pushed-bytes-conflict',
                      message:
                        'Canonical aggregate block changed an active pushed command',
                    });
                  }
                }

                for (const entry of [...journal].reverse()) {
                  await this.reverseEncodedMutations({
                    tx,
                    mutations: entry.appliedMutationInverses,
                  });
                }

                for (const resource of [
                  ...frontendBlock.delta.inserted,
                  ...frontendBlock.delta.updated,
                ]) {
                  Schema.validateSync(EncodedResourceSchema)(resource);
                  const resourceSchema =
                    this.resourceSchemas[resource.modelName];
                  if (resourceSchema === undefined) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-server-resource-model-missing',
                      message:
                        'Canonical aggregate resource model is not in the acquired spec',
                    });
                  }
                  const existing = await tx
                    .select()
                    .from(resourceSchema)
                    .where(sql`id = ${resource.id}`)
                    .get();
                  if (existing === undefined) {
                    await tx.insert(resourceSchema).values(resource).run();
                  } else {
                    await tx
                      .update(resourceSchema)
                      .set(resource)
                      .where(sql`id = ${resource.id}`)
                      .run();
                  }
                }
                for (const removed of frontendBlock.delta.deleted) {
                  const resourceSchema =
                    this.resourceSchemas[removed.modelName];
                  if (resourceSchema === undefined) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-server-resource-model-missing',
                      message:
                        'Canonical aggregate resource model is not in the acquired spec',
                    });
                  }
                  await tx
                    .delete(resourceSchema)
                    .where(sql`id = ${removed.id}`)
                    .run();
                }

                for (const entry of journal) {
                  const classification = classificationById.get(
                    entry.command.id,
                  );
                  if (
                    classification !== undefined &&
                    classification.status !== 'pushed'
                  ) {
                    await tx
                      .delete(aggregateFrontendCommandJournal)
                      .where(
                        eq(
                          aggregateFrontendCommandJournal.commandId,
                          entry.command.id,
                        ),
                      )
                      .run();
                    continue;
                  }
                  const command = classification ?? entry.command;
                  const applied = await this.applyEncodedMutations({
                    tx,
                    commandId: entry.command.id,
                    mutations: entry.mutations,
                    appliedAt: new Date(),
                  });
                  await tx
                    .update(aggregateFrontendCommandJournal)
                    .set({
                      command: Schema.encodeUnknownSync(
                        Schema.parseJson(
                          Schema.Union(
                            StagedReplicaCommandSchema,
                            PushedCommandSchema,
                          ),
                        ),
                      )(command, { onExcessProperty: 'error' }),
                      appliedMutationInverses: Schema.encodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAppliedMutationSchema),
                        ),
                      )(applied.appliedMutations, {
                        onExcessProperty: 'error',
                      }),
                    })
                    .where(
                      eq(
                        aggregateFrontendCommandJournal.commandId,
                        entry.command.id,
                      ),
                    )
                    .run();
                }

                const replicaIndex = metadata.replicaIndex + 1;
                if (!Number.isSafeInteger(replicaIndex)) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-replica-index-exhausted',
                    message:
                      'Aggregate frontend replica index exceeded the safe integer range',
                  });
                }
                await tx
                  .update(aggregateFrontendReplicaMetadata)
                  .set({
                    frontendIndex: frontendBlock.frontendIndex,
                    replicaIndex,
                  })
                  .where(
                    eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .run();
                assertSourceCurrent();
                committedBlock = Schema.validateSync(
                  AggregateFrontendReplicaBlockSchema,
                )({
                  kind: 'server',
                  systemId: this.systemId,
                  aggregateId: this.catalogRow.aggregateId,
                  aggregateName: this.catalogRow.aggregateName,
                  userId: this.catalogRow.userId,
                  frontendName: this.catalogRow.frontendName,
                  aggregateFrontendLockKey:
                    this.catalogRow.aggregateFrontendLockKey,
                  replicaIndex,
                  frontendIndex: frontendBlock.frontendIndex,
                  frontendBlock,
                });
              },
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'apply-aggregate-frontend-block-failed',
                      message:
                        'Failed to apply canonical aggregate frontend block',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            }),
        }),
      );
      if (committedBlock !== undefined) {
        this.catalogRow.frontendIndex = committedBlock.frontendIndex;
        this.catalogRow.replicaIndex = committedBlock.replicaIndex;
      }
    });

    if (repairRequired) {
      await this.repairFromRegistration();
      return;
    }
    if (committedBlock !== undefined) {
      await this.fanoutBlock(committedBlock);
    }
  }

  async pushJournalCommands(props?: {
    manual?: boolean;
  }): Promise<
    | Readonly<{ status: 'empty' }>
    | Readonly<{ status: 'pushed' }>
    | Readonly<{ status: 'retry-exhausted'; failure: IAnyErrorJson }>
    | undefined
  > {
    if (this.status === 'failed') {
      if (props?.manual !== true) return undefined;
      throw new ZerospinError({
        code: 'aggregate-frontend-replica-failed',
        message: 'The exact aggregate frontend replica has terminally failed',
      });
    }
    if (!this.onlineReplacementInstalled) {
      if (props?.manual !== true) return undefined;
      throw new ZerospinError({
        code: 'aggregate-frontend-replacement-required',
        message:
          'Aggregate frontend push is unavailable until authoritative replacement commits',
      });
    }
    if (props?.manual === true && !this.pushPaused) {
      throw new ZerospinError({
        code: 'aggregate-frontend-push-not-paused',
        message: 'Push now is available only while the exact replica is paused',
      });
    }
    if (this.inFlightPush !== null) {
      if (props?.manual === true) {
        throw new ZerospinError({
          code: 'aggregate-frontend-push-in-flight',
          message: 'An aggregate frontend push is already in flight',
        });
      }
      this.pushWakePending = true;
      return this.inFlightPush;
    }
    if (this.pushPaused && props?.manual !== true) return undefined;

    const operation = (async () => {
      const rows = await this.db
        .select()
        .from(aggregateFrontendCommandJournal)
        .all();
      const stagedRows = rows
        .map(row => ({
          row,
          command: Schema.decodeUnknownSync(
            Schema.parseJson(
              Schema.Union(StagedReplicaCommandSchema, PushedCommandSchema),
            ),
          )(row.command, { onExcessProperty: 'error' }),
        }))
        .filter(
          (
            entry,
          ): entry is typeof entry & {
            command: IEncodedCommand<IStagedReplicaCommand>;
          } => entry.command.status === 'staged',
        )
        .sort(
          (left, right) =>
            left.command.replicaIndex - right.command.replicaIndex,
        );
      if (stagedRows.length === 0) return { status: 'empty' } as const;

      if (
        !this.registrations.some(
          candidate => !candidate.released && candidate.mode === 'online',
        )
      ) {
        if (props?.manual === true) {
          throw new ZerospinError({
            code: 'aggregate-frontend-registration-unavailable',
            message:
              'No live online aggregate frontend registration is available for the exact replica',
          });
        }
        return undefined;
      }

      if (this.installedAuthority === null) {
        await this.repairFromRegistration({
          replaceState: !this.onlineReplacementInstalled,
        });
      }

      const commands = stagedRows.map(entry => entry.command);
      const registeredCandidates = this.registrations;
      let authority: Readonly<{
        registrationId: string;
        ownerToken: object;
        authenticatedApi: Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi'];
        frontendApi: Parameters<
          typeof fetchAggregateFrontendState
        >[0]['frontendApi'];
      }> | null = null;
      let registration: (typeof registeredCandidates)[number] | undefined;
      let selectionAttempt: object | null = null;
      let result: IPushBlock | undefined;
      let pushFailure: unknown;
      let failedPushAuthority: Readonly<{
        registrationId: string;
        ownerToken: object;
        authenticatedApi: Effect.Effect.Success<
          ReturnType<typeof authenticate>
        >['authenticatedApi'];
        frontendApi: Parameters<
          typeof fetchAggregateFrontendState
        >[0]['frontendApi'];
      }> | null = null;
      for (let pushAttempt = 0; pushAttempt < 2; pushAttempt += 1) {
        if (pushAttempt === 1) {
          if (failedPushAuthority === null) break;
          try {
            if (this.installedAuthority === failedPushAuthority) {
              await this.repairFromRegistration({
                refreshAuthority: true,
                replaceState: false,
              });
            } else if (this.installedAuthority === null) {
              await this.repairFromRegistration({
                forceFresh: true,
                replaceState: false,
              });
            }
          } catch (cause) {
            pushFailure = cause;
            break;
          }
        }
        const candidateAuthority: Readonly<{
          registrationId: string;
          ownerToken: object;
          authenticatedApi: Effect.Effect.Success<
            ReturnType<typeof authenticate>
          >['authenticatedApi'];
          frontendApi: Parameters<
            typeof fetchAggregateFrontendState
          >[0]['frontendApi'];
        }> | null = this.installedAuthority;
        const candidateRegistration =
          candidateAuthority === null
            ? undefined
            : this.registrations.find(
                candidate =>
                  candidate.id === candidateAuthority.registrationId &&
                  candidate.ownerToken === candidateAuthority.ownerToken &&
                  !candidate.released &&
                  candidate.mode === 'online',
              );
        const candidateSelectionAttempt = this.authoritySelectionAttempt;
        if (
          candidateAuthority === null ||
          candidateRegistration === undefined ||
          candidateAuthority.authenticatedApi !==
            candidateRegistration.getCurrentAuthenticatedApi()
        ) {
          pushFailure = new ZerospinError({
            code: 'aggregate-frontend-registration-unavailable',
            message:
              'The exact aggregate replica has no installed online authority',
          });
          break;
        }
        try {
          if (
            this.installedAuthority !== candidateAuthority ||
            this.authoritySelectionAttempt !== candidateSelectionAttempt ||
            candidateRegistration.released ||
            !this.registrations.includes(candidateRegistration) ||
            candidateAuthority.registrationId !== candidateRegistration.id ||
            candidateAuthority.ownerToken !==
              candidateRegistration.ownerToken ||
            candidateAuthority.authenticatedApi !==
              candidateRegistration.getCurrentAuthenticatedApi()
          ) {
            throw new ZerospinError({
              code: 'aggregate-frontend-registration-stale',
              message:
                'The selected registration changed before push invocation',
            });
          }
          const pushed = await this.authenticationRuntime.runPromise(
            pushAggregateFrontendCommands({
              frontendApi: candidateAuthority.frontendApi,
              commands,
            }).pipe(Effect.retry(defaultRetrySchedule), Effect.either),
          );
          if (Either.isLeft(pushed)) throw pushed.left;
          result = Schema.validateSync(PushBlockSchema)(pushed.right, {
            onExcessProperty: 'error',
          });
          if (
            this.installedAuthority !== candidateAuthority ||
            this.authoritySelectionAttempt !== candidateSelectionAttempt ||
            candidateRegistration.released ||
            !this.registrations.includes(candidateRegistration) ||
            candidateAuthority.registrationId !== candidateRegistration.id ||
            candidateAuthority.ownerToken !==
              candidateRegistration.ownerToken ||
            candidateAuthority.authenticatedApi !==
              candidateRegistration.getCurrentAuthenticatedApi()
          ) {
            throw new ZerospinError({
              code: 'aggregate-frontend-registration-stale',
              message:
                'The installed aggregate authority changed during command push',
            });
          }
          authority = candidateAuthority;
          registration = candidateRegistration;
          selectionAttempt = candidateSelectionAttempt;
          break;
        } catch (cause) {
          pushFailure = cause;
          if (
            ZerospinError.isZerospinError(cause) &&
            (cause.code === 'aggregate-frontend-lock-unsupported' ||
              cause.extra?.registrationAdmissionRejected === true)
          ) {
            break;
          }
          failedPushAuthority = candidateAuthority;
          if (this.installedAuthority === candidateAuthority) {
            this.authoritySelectionAttempt = {};
            this.authoritySelectionPromise = null;
          }
        }
      }
      if (
        ZerospinError.isZerospinError(pushFailure) &&
        (pushFailure.code === 'aggregate-frontend-lock-unsupported' ||
          pushFailure.extra?.registrationAdmissionRejected === true)
      ) {
        this.authoritySelectionAttempt = {};
        const failedAuthority = this.installedAuthority;
        this.installedAuthority = null;
        this.onlineReplacementInstalled = false;
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        if (this.reconnectFiber !== null) {
          this.runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        this.socketState = 'disconnected';
        failedAuthority?.frontendApi[Symbol.dispose]();
        this.status = 'failed';
        this.lastFailure = ZerospinError.stringify(pushFailure);
        const publicFailure = Schema.encodeUnknownSync(ZerospinError.schema)(
          pushFailure,
        );
        for (const liveRegistration of this.registrations) {
          if (liveRegistration.released) continue;
          try {
            await this.runtime.runPromise(
              decodeRpc(
                await liveRegistration.sink.handleFailure(publicFailure),
              ),
            );
          } catch {
            // The exact Repo remains terminal even when notification fails.
          }
        }
      }
      if (
        registration === undefined ||
        authority === null ||
        selectionAttempt === null ||
        result === undefined
      ) {
        const failure = ZerospinError.isZerospinError(pushFailure)
          ? pushFailure
          : new ZerospinError({
              code: 'aggregate-frontend-command-push-failed',
              message: 'No online registration completed the aggregate push',
              cause: ZerospinError.prettyUnknownFailure(pushFailure),
            });
        if (this.installedAuthority === null) {
          setTimeout(() => void this.scheduleReconnect(), 0);
        }
        return {
          status: 'retry-exhausted',
          failure: Schema.encodeUnknownSync(ZerospinError.schema)(failure),
        } as const;
      }
      if (
        this.installedAuthority !== authority ||
        this.authoritySelectionAttempt !== selectionAttempt ||
        registration.released ||
        !this.registrations.includes(registration) ||
        authority.registrationId !== registration.id ||
        authority.ownerToken !== registration.ownerToken ||
        authority.authenticatedApi !== registration.getCurrentAuthenticatedApi()
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-registration-stale',
          message: 'The selected registration changed before push validation',
        });
      }

      const capturedById = new Map(
        stagedRows.map(entry => [entry.command.id, entry]),
      );
      const returnedById = new Map<
        string,
        | IEncodedCommand<IPushedCommand>
        | IEncodedCommand<IExecutedPushedCommand>
        | IEncodedCommand<IFailedPushedCommand>
        | IEncodedCommand<IFailedStagedReplicaCommand>
        | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
      >();
      for (const command of [
        ...result.pendingCommands,
        ...result.pushedCommands,
        ...result.executedCommands,
        ...result.failedStagedCommands,
        ...result.failedPushedCommands,
      ]) {
        if (!capturedById.has(command.id) || returnedById.has(command.id)) {
          throw new ZerospinError({
            code: 'aggregate-command-push-response-conflict',
            message:
              'The push response contained a duplicate or unknown command',
          });
        }
        returnedById.set(command.id, command);
      }
      if (returnedById.size !== stagedRows.length) {
        throw new ZerospinError({
          code: 'aggregate-command-push-response-conflict',
          message:
            'The push response did not contain every captured command exactly once',
        });
      }
      for (const entry of stagedRows) {
        const returned = returnedById.get(entry.command.id);
        if (returned === undefined) {
          throw new ZerospinError({
            code: 'aggregate-command-push-response-conflict',
            message: 'The push response omitted a captured command',
          });
        }
        const submittedBytes = Schema.encodeUnknownSync(
          Schema.parseJson(StagedReplicaCommandSchema),
        )(entry.command, { onExcessProperty: 'error' });
        const returnedBytes = Schema.encodeUnknownSync(
          Schema.parseJson(StagedReplicaCommandSchema),
        )(
          { ...returned, pushedCursor: null, status: 'staged' },
          { onExcessProperty: 'ignore' },
        );
        if (submittedBytes !== returnedBytes) {
          throw new ZerospinError({
            code: 'aggregate-command-push-response-bytes-conflict',
            message: 'The push response changed stable replica-command bytes',
          });
        }
      }

      if (result.failedStagedCommands.length === 0) {
        if (!this.onlineReplacementInstalled) {
          setTimeout(
            () =>
              void this.repairFromRegistration({ replaceState: true }).catch(
                () => undefined,
              ),
            0,
          );
        }
        return { status: 'pushed' } as const;
      }

      let committedReplacement: IAggregateFrontendReplicaState | undefined;
      let committedReplicaIndex: number | undefined;
      await this.serialize(async () => {
        if (
          this.installedAuthority !== authority ||
          this.authoritySelectionAttempt !== selectionAttempt ||
          registration.released ||
          !this.registrations.includes(registration) ||
          authority.registrationId !== registration.id ||
          authority.ownerToken !== registration.ownerToken ||
          authority.authenticatedApi !==
            registration.getCurrentAuthenticatedApi()
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-registration-stale',
            message: 'The selected registration changed before push commit',
          });
        }
        await this.runtime.runPromise(
          makeTxAsync({
            db: this.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  if (
                    this.installedAuthority !== authority ||
                    this.authoritySelectionAttempt !== selectionAttempt ||
                    registration.released ||
                    !this.registrations.includes(registration) ||
                    authority.registrationId !== registration.id ||
                    authority.ownerToken !== registration.ownerToken ||
                    authority.authenticatedApi !==
                      registration.getCurrentAuthenticatedApi()
                  ) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-registration-stale',
                      message:
                        'The installed aggregate authority changed before failed-stage rewind',
                    });
                  }
                  const metadata = await tx
                    .select()
                    .from(aggregateFrontendReplicaMetadata)
                    .where(
                      eq(
                        aggregateFrontendReplicaMetadata.id,
                        this.catalogRow.id,
                      ),
                    )
                    .get();
                  if (metadata === undefined) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-replica-metadata-missing',
                      message:
                        'Failed-stage settlement requires committed metadata',
                    });
                  }
                  const journal = (
                    await tx
                      .select()
                      .from(aggregateFrontendCommandJournal)
                      .all()
                  )
                    .map(row => ({
                      row,
                      command: Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Union(
                            StagedReplicaCommandSchema,
                            PushedCommandSchema,
                          ),
                        ),
                      )(row.command, { onExcessProperty: 'error' }),
                      mutations: Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAggregateFrontendMutationSchema),
                        ),
                      )(row.mutations, { onExcessProperty: 'error' }),
                      appliedMutationInverses: Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAppliedMutationSchema),
                        ),
                      )(row.appliedMutationInverses, {
                        onExcessProperty: 'error',
                      }),
                    }))
                    .sort(
                      (left, right) =>
                        left.command.replicaIndex - right.command.replicaIndex,
                    );
                  const journalById = new Map(
                    journal.map(entry => [entry.command.id, entry]),
                  );
                  const failedIds = new Set(
                    result.failedStagedCommands.map(command => command.id),
                  );
                  for (const failed of result.failedStagedCommands) {
                    const captured = capturedById.get(failed.id);
                    if (captured === undefined) {
                      throw new ZerospinError({
                        code: 'aggregate-command-push-response-conflict',
                        message:
                          'Failed-stage settlement references an unknown command',
                      });
                    }
                    const live = journalById.get(failed.id);
                    if (
                      live === undefined ||
                      live.row.command !== captured.row.command ||
                      live.row.mutations !== captured.row.mutations
                    ) {
                      throw new ZerospinError({
                        code: 'aggregate-command-push-response-conflict',
                        message:
                          'Captured staged command changed before failed-stage settlement',
                      });
                    }
                    if (live.command.status !== 'staged') {
                      throw new ZerospinError({
                        code: 'aggregate-command-push-response-conflict',
                        message:
                          'Failed-stage settlement found a non-staged journal row',
                      });
                    }
                  }

                  for (const entry of [...journal].reverse()) {
                    await this.reverseEncodedMutations({
                      tx,
                      mutations: entry.appliedMutationInverses,
                    });
                  }
                  for (const entry of journal) {
                    if (failedIds.has(entry.command.id)) {
                      await tx
                        .delete(aggregateFrontendCommandJournal)
                        .where(
                          eq(
                            aggregateFrontendCommandJournal.commandId,
                            entry.command.id,
                          ),
                        )
                        .run();
                      continue;
                    }
                    const applied = await this.applyEncodedMutations({
                      tx,
                      commandId: entry.command.id,
                      mutations: entry.mutations,
                      appliedAt: new Date(),
                    });
                    await tx
                      .update(aggregateFrontendCommandJournal)
                      .set({
                        appliedMutationInverses: Schema.encodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedAppliedMutationSchema),
                          ),
                        )(applied.appliedMutations, {
                          onExcessProperty: 'error',
                        }),
                      })
                      .where(
                        eq(
                          aggregateFrontendCommandJournal.commandId,
                          entry.command.id,
                        ),
                      )
                      .run();
                  }

                  const replicaIndex = metadata.replicaIndex + 1;
                  if (!Number.isSafeInteger(replicaIndex)) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-replica-index-exhausted',
                      message:
                        'Aggregate frontend replica index exceeded the safe integer range',
                    });
                  }
                  await tx
                    .update(aggregateFrontendReplicaMetadata)
                    .set({ replicaIndex })
                    .where(
                      eq(
                        aggregateFrontendReplicaMetadata.id,
                        this.catalogRow.id,
                      ),
                    )
                    .run();
                  if (
                    this.installedAuthority !== authority ||
                    this.authoritySelectionAttempt !== selectionAttempt ||
                    registration.released ||
                    !this.registrations.includes(registration) ||
                    authority.registrationId !== registration.id ||
                    authority.ownerToken !== registration.ownerToken ||
                    authority.authenticatedApi !==
                      registration.getCurrentAuthenticatedApi()
                  ) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-registration-stale',
                      message:
                        'The installed aggregate authority changed before failed-stage commit',
                    });
                  }
                  committedReplicaIndex = replicaIndex;
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'commit-aggregate-command-push-failed',
                        message:
                          'Failed to commit exact aggregate command push results',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              }),
          }),
        );
        if (committedReplicaIndex === undefined) {
          throw new ZerospinError({
            code: 'aggregate-frontend-replica-index-commit-missing',
            message:
              'Failed-stage settlement did not produce a committed replica index',
          });
        }
        this.catalogRow.replicaIndex = committedReplicaIndex;
        committedReplacement = Schema.validateSync(
          AggregateFrontendReplicaStateSchema,
        )({
          ...(await this.getSnapshot()),
          failedStagedCommands: result.failedStagedCommands,
        });
      });
      if (committedReplacement !== undefined) {
        await this.fanoutReplacement(committedReplacement);
      }
      if (!this.onlineReplacementInstalled) {
        setTimeout(
          () =>
            void this.repairFromRegistration({ replaceState: true }).catch(
              () => undefined,
            ),
          0,
        );
      }
      return { status: 'pushed' } as const;
    })();

    this.inFlightPush = operation;
    try {
      return await operation;
    } finally {
      if (this.inFlightPush === operation) this.inFlightPush = null;
      if (this.pushWakePending) {
        this.pushWakePending = false;
        if (!this.pushPaused) {
          setTimeout(
            () => void this.pushJournalCommands().catch(() => undefined),
            0,
          );
        }
      }
    }
  }

  setPushPaused(pushPaused: boolean): void {
    this.pushPaused = pushPaused;
    if (!pushPaused) {
      setTimeout(
        () => void this.pushJournalCommands().catch(() => undefined),
        0,
      );
    }
  }

  get pushInFlight(): boolean {
    return this.inFlightPush !== null;
  }

  get isPushPaused(): boolean {
    return this.pushPaused;
  }

  get runtimeStatus(): 'activating' | 'ready' | 'repairing' | 'failed' {
    return this.status;
  }

  get runtimeSocketState():
    | 'disconnected'
    | 'connecting'
    | 'replaying'
    | 'online' {
    return this.socketState;
  }

  get runtimeReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  get runtimeLastFailure(): string | null {
    return this.lastFailure;
  }

  requiresOnlineReplacement(): boolean {
    if (!this.onlineReplacementInstalled) return true;
    const authority = this.installedAuthority;
    if (authority === null) return true;
    const registration = this.registrations.find(
      candidate =>
        candidate.id === authority.registrationId &&
        candidate.ownerToken === authority.ownerToken &&
        !candidate.released &&
        candidate.mode === 'online',
    );
    return (
      registration === undefined ||
      authority.authenticatedApi !== registration.getCurrentAuthenticatedApi()
    );
  }

  async stage(props: {
    ownerToken: object;
    sessionIndex: number;
    command: IEncodedCommand<IStagedSessionCommand>;
    mutations: readonly IEncodedAggregateFrontendMutation[];
  }): Promise<Readonly<{ commandId: string }>> {
    return this.serialize(async () => {
      if (this.status === 'failed') {
        throw this.lastFailure === null
          ? new ZerospinError({
              code: 'aggregate-frontend-replica-failed',
              message: 'Aggregate frontend replica is terminally failed',
            })
          : ZerospinError.parse(this.lastFailure);
      }
      if (this.status !== 'ready' && this.status !== 'repairing') {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-write-unavailable',
          message:
            'Aggregate frontend replica is not ready for durable staging',
        });
      }
      if (
        !this.registrations.some(
          registration =>
            !registration.released &&
            registration.ownerToken === props.ownerToken,
        )
      ) {
        throw new ZerospinError({
          code: 'aggregate-frontend-replica-stage-capability-missing',
          message:
            'The staging port has no live exact-lock aggregate capability',
        });
      }
      Schema.validateSync(StagedSessionCommandSchema)(props.command, {
        onExcessProperty: 'error',
      });
      if (!Number.isSafeInteger(props.sessionIndex) || props.sessionIndex < 1) {
        throw new ZerospinError({
          code: 'aggregate-frontend-command-session-index-invalid',
          message: 'Command sessionIndex must be a positive safe integer',
        });
      }
      if (
        props.command.aggregateId !== this.catalogRow.aggregateId ||
        props.command.aggregateName !== this.catalogRow.aggregateName ||
        props.command.userId !== this.catalogRow.userId ||
        props.command.frontendName !== this.catalogRow.frontendName
      ) {
        throw new ZerospinError({
          code: 'staged-aggregate-frontend-command-target-mismatch',
          message:
            'Staged command does not match the acquired exact aggregate target',
        });
      }
      let expectedMutationIndex = 0;
      for (const mutation of props.mutations) {
        Schema.validateSync(EncodedAggregateFrontendMutationSchema)(mutation);
        if (
          mutation.commandId !== props.command.id ||
          mutation.mutationIndex !== expectedMutationIndex
        ) {
          throw new ZerospinError({
            code: 'aggregate-frontend-journal-mutation-sequence-invalid',
            message:
              'Staged mutations must use the command ID and contiguous order',
          });
        }
        expectedMutationIndex += 1;
      }

      const encodedSessionCommand = Schema.encodeUnknownSync(
        Schema.parseJson(StagedSessionCommandSchema),
      )(props.command, { onExcessProperty: 'error' });
      const encodedMutations = Schema.encodeUnknownSync(
        Schema.parseJson(Schema.Array(EncodedAggregateFrontendMutationSchema)),
      )(props.mutations, { onExcessProperty: 'error' });
      let replicaBlock: IAggregateFrontendReplicaBlock | undefined;
      let receipt: Readonly<{ commandId: string }> | undefined;

      await this.runtime.runPromise(
        makeTxAsync({
          db: this.db,
          program: ({ tx }) =>
            Effect.tryPromise({
              try: async () => {
                const existingRows = await tx
                  .select()
                  .from(aggregateFrontendCommandJournal)
                  .where(
                    or(
                      eq(
                        aggregateFrontendCommandJournal.commandId,
                        props.command.id,
                      ),
                      and(
                        eq(
                          aggregateFrontendCommandJournal.sessionId,
                          props.command.sessionId,
                        ),
                        eq(
                          aggregateFrontendCommandJournal.sessionIndex,
                          props.sessionIndex,
                        ),
                      ),
                    ),
                  )
                  .all();
                if (existingRows.length > 1) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-command-journal-conflict',
                    message:
                      'Command ID and session index resolve to different exact journal rows',
                  });
                }
                const existing = existingRows[0];
                if (existing !== undefined) {
                  const existingCommand = Schema.decodeUnknownSync(
                    Schema.parseJson(
                      Schema.Union(
                        StagedReplicaCommandSchema,
                        PushedCommandSchema,
                      ),
                    ),
                  )(existing.command, { onExcessProperty: 'error' });
                  const existingSessionBytes = Schema.encodeUnknownSync(
                    Schema.parseJson(StagedSessionCommandSchema),
                  )(
                    {
                      ...existingCommand,
                      pushedCursor: null,
                      status: 'staged',
                    },
                    { onExcessProperty: 'ignore' },
                  );
                  if (
                    existing.commandId !== props.command.id ||
                    existing.sessionId !== props.command.sessionId ||
                    existing.sessionIndex !== props.sessionIndex ||
                    existingSessionBytes !== encodedSessionCommand ||
                    existing.mutations !== encodedMutations
                  ) {
                    throw new ZerospinError({
                      code: 'aggregate-frontend-command-id-conflict',
                      message:
                        'The exact journal already contains different command or mutation bytes for this identity',
                    });
                  }
                  receipt = { commandId: existing.commandId };
                  return;
                }

                const metadata = await tx
                  .select()
                  .from(aggregateFrontendReplicaMetadata)
                  .where(
                    eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .get();
                if (metadata === undefined) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-replica-metadata-missing',
                    message:
                      'Aggregate command handoff requires committed metadata',
                  });
                }
                const replicaIndex = metadata.replicaIndex + 1;
                if (!Number.isSafeInteger(replicaIndex)) {
                  throw new ZerospinError({
                    code: 'aggregate-frontend-replica-index-exhausted',
                    message:
                      'Aggregate frontend replica index exceeded the safe integer range',
                  });
                }
                const replicaCommand = Schema.validateSync(
                  StagedReplicaCommandSchema,
                )({ ...props.command, replicaIndex });
                const encodedReplicaCommand = Schema.encodeUnknownSync(
                  Schema.parseJson(StagedReplicaCommandSchema),
                )(replicaCommand, { onExcessProperty: 'error' });
                const applied = await this.applyEncodedMutations({
                  tx,
                  commandId: props.command.id,
                  mutations: props.mutations,
                  appliedAt: props.command.stagedAt,
                });
                const appliedMutationInverses = Schema.encodeUnknownSync(
                  Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
                )(applied.appliedMutations, {
                  onExcessProperty: 'error',
                });
                await tx
                  .insert(aggregateFrontendCommandJournal)
                  .values({
                    commandId: props.command.id,
                    sessionId: props.command.sessionId,
                    sessionIndex: props.sessionIndex,
                    command: encodedReplicaCommand,
                    mutations: encodedMutations,
                    appliedMutationInverses,
                  })
                  .run();
                await tx
                  .update(aggregateFrontendReplicaMetadata)
                  .set({ replicaIndex })
                  .where(
                    eq(aggregateFrontendReplicaMetadata.id, this.catalogRow.id),
                  )
                  .run();
                replicaBlock = Schema.validateSync(
                  AggregateFrontendReplicaBlockSchema,
                )({
                  kind: 'local-command',
                  systemId: this.systemId,
                  aggregateId: this.catalogRow.aggregateId,
                  aggregateName: this.catalogRow.aggregateName,
                  userId: this.catalogRow.userId,
                  frontendName: this.catalogRow.frontendName,
                  aggregateFrontendLockKey:
                    this.catalogRow.aggregateFrontendLockKey,
                  replicaIndex,
                  frontendIndex: metadata.frontendIndex,
                  delta: applied.delta,
                  stagedCommandsAdded: [replicaCommand],
                  stagedCommandIdsRemoved: [],
                  pushedCommandsAdded: [],
                  pushedCommandIdsRemoved: [],
                  executedPushedCommandsAdded: [],
                  executedPushedCommandIdsRemoved: [],
                  failedStagedCommandsAdded: [],
                  failedPushedCommandsAdded: [],
                  failedCommandIdsRemoved: [],
                  optimisticAppliedMutationsAdded: [
                    {
                      commandId: replicaCommand.id,
                      mutations: applied.appliedMutations,
                    },
                  ],
                  optimisticAppliedMutationCommandIdsRemoved: [],
                });
                receipt = { commandId: props.command.id };
              },
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'persist-staged-aggregate-frontend-command-failed',
                      message:
                        'Failed to atomically persist and materialize the staged command',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            }),
        }),
      );

      if (receipt === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-command-receipt-missing',
          message: 'The staged command transaction produced no receipt',
        });
      }
      if (replicaBlock !== undefined) {
        this.catalogRow.replicaIndex = replicaBlock.replicaIndex;
        await this.fanoutBlock(replicaBlock);
        setTimeout(
          () => void this.pushJournalCommands().catch(() => undefined),
          0,
        );
      }
      return receipt;
    });
  }

  activeRegistrationCount(): number {
    return this.registrations.filter(registration => !registration.released)
      .length;
  }
}
