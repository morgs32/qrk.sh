import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedCommandSchema,
  PushedCommandSchema,
  StagedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  EncodedAppliedMutationSchema,
  EncodedFrontendMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IEncodedFrontendMutation,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IFailedStagedCommand,
  IPushedCommand,
  IStagedCommand,
} from '@zerospin/core/contracts/types';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedShape } from '@zerospin/core/models/encodeShape';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeTable } from '@zerospin/core/models/makeTable';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import { makeDrizzleSchemaFromEncodedTable } from '@zerospin/core/models/primitiveMaps';
import { primitives } from '@zerospin/core/models/primitives';
import type {
  IAccountId,
  IActorId,
  IAnyDrizzleSchemas,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import {
  ServiceFrontendLineageBlockSchema,
  ServiceFrontendLineageTransitionRequiredSchema,
  ServiceFrontendReplicaBlockSchema,
  ServiceFrontendReplicaStateSchema,
} from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type {
  IServiceFrontendLineageBlock,
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
  IServiceFrontendState,
} from '@zerospin/core/serviceSession/types';
import {
  FrontendLineageBlockSchema,
  FrontendLineageTransitionRequiredSchema,
  FrontendReplicaBlockSchema,
  FrontendReplicaStateSchema,
} from '@zerospin/core/session/FrontendBlockSchema';
import type {
  IFrontendDelta,
  IFrontendLineageBlock,
  IFrontendReplicaBlock,
  IFrontendReplicaState,
  IFrontendSyncState,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { newMessagePortRpcSession, RpcStub, RpcTarget } from 'capnweb';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  Duration,
  Effect,
  Either,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
} from 'effect';

import { makeAsyncWaSqliteDrizzle } from '../drizzle/makeAsyncWaSqliteDrizzle.ts';
import { makeIdbSQLite3 } from '../drizzle/makeIdbSQLite3.ts';
import { makeTxAsync } from '../drizzle/makeTxAsync.ts';
import { migrateDbAsync } from '../drizzle/migrateDbAsync.ts';
import type { IAsyncTx, IAsyncWaSqliteDrizzleDb } from '../drizzle/types.ts';
import type {
  AccountFrontendReplicaProviderApi,
  PartitionApi as IPartitionApi,
  ServiceFrontendReplicaProviderApi,
} from '../makeSharedWorkerSession.ts';

import { makeVfsName } from './makeVfsName.ts';
import { migratePartitionDbAsync } from './migratePartitionDbAsync.ts';
import {
  accountFrontendCommandJournal,
  accountFrontendReplicas,
  accountFrontendSourceTargetsSchema,
  partitionDbConfig,
  serviceFrontendReplicas,
} from './partitionSchemas.ts';

const partitionDatabaseName = 'partition.db';
const replicaDatabaseName = 'replica.db';

const accountReplicaStateTable = makeTable({
  name: 'accountReplicaState',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'arps' }),
    state: primitives.json({ schema: FrontendReplicaStateSchema }),
    previousBlock: primitives.json({
      schema: FrontendReplicaBlockSchema,
      nullable: true,
    }),
  },
});

const accountReplicaDbConfig = makeDbConfig({
  tables: { accountReplicaState: accountReplicaStateTable },
});
const { accountReplicaState } = accountReplicaDbConfig.schema;

const accountFrontendSocketMessageSchema = Schema.parseJson(
  Schema.Union(
    Schema.Struct({
      type: Schema.Literal('frontendBlock'),
      sync: FrontendLineageBlockSchema,
    }),
    Schema.Struct({
      type: Schema.Literal('replay-complete'),
      generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
      frontendIndex: Schema.Number,
    }),
    Schema.Struct({
      type: Schema.Literal('state-required'),
      systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
      generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
      accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
      accountName: Schema.String,
      actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
      actorName: Schema.String,
      frontendName: Schema.String,
      frontendVersion: Schema.String,
      frontendIndex: Schema.Number,
    }),
    Schema.extend(
      FrontendLineageTransitionRequiredSchema,
      Schema.Struct({
        type: Schema.Literal('lineage-transition-required'),
      }),
    ),
  ),
);

const serviceFrontendSocketMessageSchema = Schema.parseJson(
  Schema.Union(
    Schema.Struct({
      type: Schema.Literal('serviceFrontendBlock'),
      sync: ServiceFrontendLineageBlockSchema,
    }),
    Schema.Struct({
      type: Schema.Literal('replay-complete'),
      generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
      frontendIndex: Schema.Number,
    }),
    Schema.Struct({
      type: Schema.Literal('state-required'),
      systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
      generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
      serviceName: Schema.String,
      actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
      actorName: Schema.String,
      frontendName: Schema.String,
      frontendVersion: Schema.String,
      frontendIndex: Schema.Number,
    }),
    Schema.extend(
      ServiceFrontendLineageTransitionRequiredSchema,
      Schema.Struct({
        type: Schema.Literal('lineage-transition-required'),
      }),
    ),
  ),
);

const serviceReplicaStateTable = makeTable({
  name: 'serviceReplicaState',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'srps' }),
    state: primitives.json({ schema: ServiceFrontendReplicaStateSchema }),
    previousBlock: primitives.json({
      schema: ServiceFrontendReplicaBlockSchema,
      nullable: true,
    }),
  },
});

const serviceReplicaDbConfig = makeDbConfig({
  tables: { serviceReplicaState: serviceReplicaStateTable },
});
const { serviceReplicaState } = serviceReplicaDbConfig.schema;

const encodedShapeSchema = Schema.declare(
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

const sharedWorkerHostDefaultRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

export function makeSharedWorkerHost(
  props: {
    runtime?: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >;
  } = {},
): void {
  const { runtime = sharedWorkerHostDefaultRuntime } = props;

  const locationUrl = new URL(globalThis.location.href);
  const rawSystemId = locationUrl.searchParams.get('systemId');
  const rawGenerationId = locationUrl.searchParams.get('generationId');
  const apiUrl = locationUrl.searchParams.get('apiUrl');
  const publishableKey = locationUrl.searchParams.get('publishableKey');
  const wasmUrl = locationUrl.searchParams.get('wasmUrl');

  if (
    rawSystemId === null ||
    rawGenerationId === null ||
    apiUrl === null ||
    publishableKey === null ||
    wasmUrl === null
  ) {
    throw new Error(
      'SharedWorker URL is missing systemId, generationId, apiUrl, publishableKey, or wasmUrl search params',
    );
  }

  const systemId = Schema.decodeUnknownSync(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(rawSystemId);
  const generationId = Schema.decodeUnknownSync(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(rawGenerationId);

  const sharedWorkerWasmUrl = wasmUrl;
  const sharedWorkerApiUrl = apiUrl;
  const sharedWorkerPublishableKey = publishableKey;
  let nextRegistrationId = 0;

  const partitionStores = new Map<
    string,
    {
      partitionKey: string;
      partitionSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof partitionDbConfig>;
      systemId: string;
      generationId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    }
  >();

  const partitionOpenPromises = new Map<
    string,
    Promise<{
      partitionKey: string;
      partitionSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof partitionDbConfig>;
      systemId: string;
      generationId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    }>
  >();

  class AccountReplicaRuntime {
    private queueTail: Promise<void> = Promise.resolve();
    private socket: WebSocket | null = null;
    private reconnectFiber: Fiber.RuntimeFiber<void, IAnyError> | null = null;
    private isTransitionRequired = false;
    private isFrontendVersionUpdateRequired = false;
    private providers: Array<{
      id: string;
      provider:
        | AccountFrontendReplicaProviderApi
        | RpcStub<AccountFrontendReplicaProviderApi>;
      authority: 'online' | 'cached-offline';
      role: 'active' | 'commissioned';
      registeredAt: number;
      ownerToken: object;
      gateOpen: boolean;
      stateRequested: boolean;
      capturedSnapshot: IFrontendReplicaState;
      bufferedBlocks: IFrontendReplicaBlock[];
      released: boolean;
    }> = [];

    constructor(
      readonly catalogRow: typeof accountFrontendReplicas.$inferSelect,
      readonly partitionStore: {
        partitionKey: string;
        partitionSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
        db: IAsyncWaSqliteDrizzleDb<typeof partitionDbConfig>;
        systemId: string;
        generationId: string;
        vfsName: string;
        acquisitionTail: Promise<void>;
      },
      public db: IAsyncWaSqliteDrizzleDb,
      readonly resourceSchemas: IAnyDrizzleSchemas,
      readonly frontendSpec: IFrontendControllerSpec,
    ) {
      this.isTransitionRequired = catalogRow.pendingTransition !== null;
    }

    serialize<SUCCESS>(program: () => Promise<SUCCESS>): Promise<SUCCESS> {
      const result = this.queueTail.then(program);
      this.queueTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }

    async getSnapshot(): Promise<IFrontendReplicaState> {
      const row = await this.db
        .select()
        .from(accountReplicaState)
        .where(eq(accountReplicaState.id, 'arps_current'))
        .get();
      if (row === undefined) {
        throw new ZerospinError({
          code: 'account-frontend-replica-state-missing',
          message: 'Account frontend replica has no committed state',
        });
      }
      return Schema.decodeUnknownSync(
        Schema.parseJson(FrontendReplicaStateSchema),
      )(row.state);
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
      mutations: readonly IEncodedFrontendMutation[];
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
        Schema.decodeUnknownSync(EncodedFrontendMutationSchema)(mutation);
        if (
          mutation.commandId !== props.commandId ||
          mutation.mutationIndex !== expectedMutationIndex
        ) {
          throw new ZerospinError({
            code: 'frontend-journal-mutation-sequence-invalid',
            message:
              'Encoded frontend mutations must use the command ID and contiguous mutation order',
          });
        }
        expectedMutationIndex += 1;

        const modelSpec = this.frontendSpec.models[mutation.modelName];
        const resourceSchema = this.resourceSchemas[mutation.modelName];
        if (modelSpec === undefined || resourceSchema === undefined) {
          throw new ZerospinError({
            code: 'frontend-journal-mutation-model-missing',
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
            code: 'frontend-journal-mutation-version-missing',
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
            code: 'frontend-journal-mutation-operation-invalid',
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
              code: 'frontend-journal-create-resource-exists',
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
              code: 'frontend-journal-create-operation-invalid',
              message: 'Create mutation attributes are invalid',
            });
          }
          const attributes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rawAttributes)) {
            const descriptor = encodedProperties[key];
            attributes[key] =
              descriptor?.kind === PrimitiveKind.Date &&
              typeof value === 'string'
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
              code: 'frontend-journal-update-resource-missing',
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
              code: 'frontend-journal-update-operation-invalid',
              message: 'Update mutation attributes are invalid',
            });
          }
          const attributes: Record<string, unknown> = {};
          const inverseAttributes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rawAttributes)) {
            const descriptor = encodedProperties[key];
            attributes[key] =
              descriptor?.kind === PrimitiveKind.Date &&
              typeof value === 'string'
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
              code: 'frontend-journal-move-operation-invalid',
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
              code: 'frontend-journal-delete-resource-missing',
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
              code: 'frontend-journal-replication-operation-invalid',
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
            code: 'frontend-journal-inverse-model-missing',
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
            code: 'frontend-journal-inverse-version-missing',
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
              code: 'frontend-journal-create-inverse-invalid',
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
            code: 'frontend-journal-inverse-invalid',
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
              code: 'frontend-journal-update-inverse-invalid',
              message: 'Update mutation inverse is incomplete',
            });
          }
          const attributes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(rawAttributes)) {
            const descriptor = encodedProperties[key];
            attributes[key] =
              descriptor?.kind === PrimitiveKind.Date &&
              typeof value === 'string'
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
              code: 'frontend-journal-move-inverse-invalid',
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
            code: 'frontend-journal-resource-inverse-invalid',
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
      frontendState: IFrontendSyncState,
    ): Promise<IFrontendReplicaState> {
      if (
        frontendState.systemId !== this.partitionStore.systemId ||
        frontendState.generationId !== this.partitionStore.generationId ||
        frontendState.accountId !== this.catalogRow.accountId ||
        frontendState.accountName !== this.catalogRow.accountName ||
        frontendState.actorId !== this.catalogRow.actorId ||
        frontendState.actorName !== this.catalogRow.actorName ||
        frontendState.frontendName !== this.catalogRow.frontendName
      ) {
        throw new ZerospinError({
          code: 'account-frontend-replica-state-target-mismatch',
          message:
            'Authoritative account frontend state targets another replica',
        });
      }

      try {
        const currentRow = await this.db
          .select()
          .from(accountReplicaState)
          .where(eq(accountReplicaState.id, 'arps_current'))
          .get();
        const currentState =
          currentRow === undefined
            ? undefined
            : Schema.decodeUnknownSync(
                Schema.parseJson(FrontendReplicaStateSchema),
              )(currentRow.state);
        const replicaIndex = (currentState?.replicaIndex ?? 0) + 1;
        const journalRows = await this.partitionStore.db
          .select()
          .from(accountFrontendCommandJournal)
          .where(
            and(
              eq(
                accountFrontendCommandJournal.accountId,
                this.catalogRow.accountId,
              ),
              eq(
                accountFrontendCommandJournal.accountName,
                this.catalogRow.accountName,
              ),
              eq(
                accountFrontendCommandJournal.actorId,
                this.catalogRow.actorId,
              ),
              eq(
                accountFrontendCommandJournal.actorName,
                this.catalogRow.actorName,
              ),
              eq(
                accountFrontendCommandJournal.frontendName,
                this.catalogRow.frontendName,
              ),
              or(
                and(
                  eq(accountFrontendCommandJournal.journalKind, 'source'),
                  eq(
                    accountFrontendCommandJournal.sourceGenerationId,
                    generationId,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendVersion,
                    this.catalogRow.frontendVersion,
                  ),
                ),
                and(
                  eq(accountFrontendCommandJournal.journalKind, 'adapted'),
                  eq(
                    accountFrontendCommandJournal.targetGenerationId,
                    generationId,
                  ),
                  eq(
                    accountFrontendCommandJournal.targetFrontendVersion,
                    this.catalogRow.frontendVersion,
                  ),
                ),
              ),
            ),
          )
          .orderBy(asc(accountFrontendCommandJournal.stagedCursor))
          .all();

        const localPushedJournalRows: typeof journalRows = [];
        for (const journalRow of journalRows) {
          if (
            journalRow.lifecycle !== 'pushed' ||
            journalRow.pushProvenance === null ||
            frontendState.pushedCommands.some(
              command => command.id === journalRow.commandId,
            ) ||
            frontendState.executedPushedCommands.some(
              command => command.id === journalRow.commandId,
            ) ||
            frontendState.failedPushedCommands.some(
              command => command.id === journalRow.commandId,
            )
          ) {
            continue;
          }
          const pushedCommand = Schema.decodeUnknownSync(
            Schema.parseJson(PushedCommandSchema),
          )(journalRow.pushProvenance);
          if (
            frontendState.lastRebasedPushedCursor !== null &&
            pushedCommand.pushedCursor <= frontendState.lastRebasedPushedCursor
          ) {
            continue;
          }
          localPushedJournalRows.push(journalRow);
        }
        const localStagedJournalRows = journalRows.filter(
          row => row.lifecycle === 'staged' || row.lifecycle === 'pushing',
        );
        const stagedCommands: IEncodedCommand<IStagedCommand>[] = [];
        const pushedCommands: IEncodedCommand<IPushedCommand>[] = [
          ...frontendState.pushedCommands,
        ];
        const optimisticAppliedMutations: Array<{
          commandId: IEncodedCommand<IStagedCommand>['id'];
          mutations: readonly IEncodedAppliedMutation[];
        }> = [];
        const journalReceipts: Array<{
          journalId: (typeof accountFrontendCommandJournal.$inferSelect)['id'];
          mutations: readonly IEncodedAppliedMutation[];
        }> = [];

        const replacement = await runtime.runPromise(
          makeTxAsync({
            db: this.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
                  for (const resourceSchema of Object.values(
                    this.resourceSchemas,
                  ).reverse()) {
                    await tx.delete(resourceSchema).run();
                  }
                  for (const resource of frontendState.resources) {
                    const resourceSchema =
                      this.resourceSchemas[resource.modelName];
                    if (resourceSchema === undefined) {
                      throw new ZerospinError({
                        code: 'account-frontend-replica-resource-model-missing',
                        message: `State resource model "${resource.modelName}" is not in the acquired spec`,
                      });
                    }
                    await tx.insert(resourceSchema).values(resource).run();
                  }

                  for (const journalRow of localPushedJournalRows) {
                    const command = Schema.decodeUnknownSync(
                      Schema.parseJson(PushedCommandSchema),
                    )(journalRow.pushProvenance);
                    const applied = await this.applyEncodedMutations({
                      tx,
                      commandId: command.id,
                      mutations: Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedFrontendMutationSchema),
                        ),
                      )(journalRow.mutations),
                      appliedAt: new Date(journalRow.stagedAt),
                    });
                    pushedCommands.push(command);
                    optimisticAppliedMutations.push({
                      commandId: command.id,
                      mutations: applied.appliedMutations,
                    });
                    journalReceipts.push({
                      journalId: journalRow.id,
                      mutations: applied.appliedMutations,
                    });
                  }
                  pushedCommands.sort((left, right) =>
                    left.pushedCursor.localeCompare(right.pushedCursor),
                  );

                  for (const journalRow of localStagedJournalRows) {
                    const command = Schema.decodeUnknownSync(
                      StagedCommandSchema,
                    )(
                      Schema.decodeUnknownSync(Schema.parseJson())(
                        journalRow.command,
                      ),
                    );
                    const applied = await this.applyEncodedMutations({
                      tx,
                      commandId: command.id,
                      mutations: Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedFrontendMutationSchema),
                        ),
                      )(journalRow.mutations),
                      appliedAt: new Date(journalRow.stagedAt),
                    });
                    stagedCommands.push(command);
                    optimisticAppliedMutations.push({
                      commandId: command.id,
                      mutations: applied.appliedMutations,
                    });
                    journalReceipts.push({
                      journalId: journalRow.id,
                      mutations: applied.appliedMutations,
                    });
                  }

                  const state: IFrontendReplicaState = {
                    ...frontendState,
                    frontendVersion: this.catalogRow.frontendVersion,
                    replicaIndex,
                    resources: await this.collectResources(tx),
                    stagedCommands,
                    pushedCommands,
                    failedStagedCommands:
                      currentState?.failedStagedCommands ?? [],
                    optimisticAppliedMutations,
                  };
                  await tx
                    .insert(accountReplicaState)
                    .values({
                      id: 'arps_current',
                      state: Schema.encodeUnknownSync(
                        Schema.parseJson(FrontendReplicaStateSchema),
                      )(state),
                      previousBlock: null,
                    })
                    .onConflictDoUpdate({
                      target: accountReplicaState.id,
                      set: {
                        state: Schema.encodeUnknownSync(
                          Schema.parseJson(FrontendReplicaStateSchema),
                        )(state),
                        previousBlock: null,
                      },
                    })
                    .run();
                  return state;
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'replace-account-frontend-replica-failed',
                        message:
                          'Failed to transactionally replace account frontend replica',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              }).pipe(Effect.withSpan('replaceAccountReplicaFromServer')),
          }),
        );

        await runtime.runPromise(
          makeTxAsync({
            db: this.partitionStore.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  for (const receipt of journalReceipts) {
                    await tx
                      .update(accountFrontendCommandJournal)
                      .set({
                        appliedMutations: Schema.encodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedAppliedMutationSchema),
                          ),
                        )(receipt.mutations),
                        materializedReplicaIndex: replicaIndex,
                        updatedAt: new Date(),
                      })
                      .where(
                        eq(accountFrontendCommandJournal.id, receipt.journalId),
                      )
                      .run();
                  }
                  for (const journalRow of journalRows) {
                    if (journalRow.lifecycle !== 'transport-uncertain') {
                      continue;
                    }
                    const pendingCommand = frontendState.pushedCommands.find(
                      command => command.id === journalRow.commandId,
                    );
                    if (pendingCommand !== undefined) {
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          command: Schema.encodeUnknownSync(
                            Schema.parseJson(PushedCommandSchema),
                          )(pendingCommand),
                          lifecycle: 'pushed',
                          pushProvenance: Schema.encodeUnknownSync(
                            Schema.parseJson(PushedCommandSchema),
                          )(pendingCommand),
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                      continue;
                    }
                    const executedCommand =
                      frontendState.executedPushedCommands.find(
                        command => command.id === journalRow.commandId,
                      );
                    if (executedCommand !== undefined) {
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          command: Schema.encodeUnknownSync(
                            Schema.parseJson(ExecutedPushedCommandSchema),
                          )(executedCommand),
                          lifecycle: 'pushed',
                          terminalOutcome: Schema.encodeUnknownSync(
                            Schema.parseJson(ExecutedPushedCommandSchema),
                          )(executedCommand),
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                      continue;
                    }
                    const failedCommand =
                      frontendState.failedPushedCommands.find(
                        command => command.id === journalRow.commandId,
                      );
                    if (failedCommand !== undefined) {
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          command: Schema.encodeUnknownSync(
                            Schema.parseJson(FailedPushedCommandSchema),
                          )(failedCommand),
                          lifecycle: 'failed',
                          terminalOutcome: Schema.encodeUnknownSync(
                            Schema.parseJson(FailedPushedCommandSchema),
                          )(failedCommand),
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                      continue;
                    }
                    await tx
                      .update(accountFrontendCommandJournal)
                      .set({ lifecycle: 'dormant', updatedAt: new Date() })
                      .where(
                        eq(accountFrontendCommandJournal.id, journalRow.id),
                      )
                      .run();
                  }
                  await tx
                    .update(accountFrontendReplicas)
                    .set({
                      status: 'ready',
                      replicaIndex,
                      frontendIndex: frontendState.frontendIndex,
                      systemVersion: frontendState.systemVersion,
                      systemWorkerName: frontendState.systemWorkerName,
                      journalHealth: 'healthy',
                      lastFailure: null,
                      updatedAt: new Date(),
                    })
                    .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                    .run();
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'commit-account-frontend-replica-catalog-failed',
                        message:
                          'Failed to commit account frontend replica catalog state',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              }).pipe(Effect.withSpan('commitAccountReplicaReplacement')),
          }),
        );

        this.catalogRow.status = 'ready';
        this.catalogRow.replicaIndex = replicaIndex;
        this.catalogRow.frontendIndex = frontendState.frontendIndex;
        this.catalogRow.systemVersion = frontendState.systemVersion;
        this.catalogRow.systemWorkerName = frontendState.systemWorkerName;
        this.catalogRow.journalHealth = 'healthy';
        this.catalogRow.lastFailure = null;
        return replacement;
      } catch (physicalCause) {
        if (this.catalogRow.status !== 'ready') {
          throw physicalCause;
        }

        if (this.catalogRow.journalHealth === 'corrupt') {
          throw new ZerospinError({
            code: 'account-frontend-journal-corrupt',
            message:
              'A corrupt account journal cannot authorize materialization replacement',
            cause: ZerospinError.prettyUnknownFailure(physicalCause),
          });
        }

        let rebuildJournalRows: (typeof accountFrontendCommandJournal.$inferSelect)[];
        try {
          const allJournalRows = await this.partitionStore.db
            .select()
            .from(accountFrontendCommandJournal)
            .all();
          rebuildJournalRows = allJournalRows.filter(
            row =>
              row.accountId === this.catalogRow.accountId &&
              row.accountName === this.catalogRow.accountName &&
              row.actorId === this.catalogRow.actorId &&
              row.actorName === this.catalogRow.actorName &&
              row.frontendName === this.catalogRow.frontendName &&
              ((row.journalKind === 'source' &&
                row.sourceGenerationId === generationId &&
                row.frontendVersion === this.catalogRow.frontendVersion) ||
                (row.journalKind === 'adapted' &&
                  row.targetGenerationId === generationId &&
                  row.targetFrontendVersion ===
                    this.catalogRow.frontendVersion)),
          );
          for (const row of rebuildJournalRows) {
            Schema.decodeUnknownSync(
              Schema.parseJson(
                Schema.Union(
                  StagedCommandSchema,
                  PushedCommandSchema,
                  ExecutedPushedCommandSchema,
                  FailedStagedCommandSchema,
                  FailedPushedCommandSchema,
                ),
              ),
            )(row.command);
            Schema.decodeUnknownSync(
              Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
            )(row.mutations);
            Schema.decodeUnknownSync(
              Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
            )(row.appliedMutations);
            if (row.sourceCommand !== null) {
              Schema.decodeUnknownSync(Schema.parseJson(StagedCommandSchema))(
                row.sourceCommand,
              );
            }
            if (row.pushProvenance !== null) {
              Schema.decodeUnknownSync(Schema.parseJson(PushedCommandSchema))(
                row.pushProvenance,
              );
            }
            if (row.terminalOutcome !== null) {
              Schema.decodeUnknownSync(
                Schema.parseJson(
                  Schema.Union(
                    ExecutedPushedCommandSchema,
                    FailedStagedCommandSchema,
                    FailedPushedCommandSchema,
                  ),
                ),
              )(row.terminalOutcome);
            }
            for (const candidate of allJournalRows) {
              if (
                candidate.id === row.id ||
                candidate.commandId !== row.commandId
              ) {
                continue;
              }
              const forwardLineage =
                row.targetGenerationId === candidate.sourceGenerationId &&
                row.targetFrontendVersion === candidate.frontendVersion;
              const reverseLineage =
                candidate.targetGenerationId === row.sourceGenerationId &&
                candidate.targetFrontendVersion === row.frontendVersion;
              const sourceAndAdaptedPair =
                row.journalKind !== candidate.journalKind &&
                row.sourceGenerationId === candidate.sourceGenerationId &&
                row.accountId === candidate.accountId &&
                row.accountName === candidate.accountName &&
                row.actorId === candidate.actorId &&
                row.actorName === candidate.actorName &&
                row.frontendName === candidate.frontendName &&
                row.frontendVersion === candidate.frontendVersion;
              if (!forwardLineage && !reverseLineage && !sourceAndAdaptedPair) {
                throw new ZerospinError({
                  code: 'account-frontend-journal-command-ownership-ambiguous',
                  message: `Command "${row.commandId}" has unrelated journal owners`,
                });
              }
            }
          }
        } catch (cause) {
          const failure = ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'account-frontend-journal-verification-failed',
                message:
                  'Account materialization cannot be rebuilt because its separate journal could not be verified',
                cause: ZerospinError.prettyUnknownFailure(cause),
              });
          await this.partitionStore.db
            .update(accountFrontendReplicas)
            .set({
              journalHealth: 'corrupt',
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.journalHealth = 'corrupt';
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          throw failure;
        }

        const oldDatabaseName = this.catalogRow.databaseName;
        const previousDatabaseNames = Schema.decodeUnknownSync(
          Schema.parseJson(Schema.Array(Schema.String)),
        )(this.catalogRow.previousDatabaseNames);
        const rebuiltDatabaseId = await runtime.runPromise(
          makeIdFromAbbreviation({ abbreviation: 'afrp' }),
        );
        const rebuiltDatabaseName = `${rebuiltDatabaseId}.db`;
        const rebuiltReplicaSqlite = await makeIdbSQLite3({
          databaseName: rebuiltDatabaseName,
          vfsName: `${this.partitionStore.vfsName}/account/${this.catalogRow.id}`,
          wasmUrl: sharedWorkerWasmUrl,
        });
        const completeReplicaDbConfig = {
          schema: {
            ...this.resourceSchemas,
            ...accountReplicaDbConfig.schema,
          },
          relations: accountReplicaDbConfig.relations,
        };
        const rebuiltDb = makeAsyncWaSqliteDrizzle(
          rebuiltReplicaSqlite,
          completeReplicaDbConfig,
        );

        try {
          await runtime.runPromise(
            migrateDbAsync({
              db: rebuiltDb,
              schema: completeReplicaDbConfig.schema,
            }),
          );

          const replicaIndex = this.catalogRow.replicaIndex + 1;
          const stagedCommands: IEncodedCommand<IStagedCommand>[] = [];
          const pushedCommands: IEncodedCommand<IPushedCommand>[] = [
            ...frontendState.pushedCommands,
          ];
          const executedPushedCommands: IEncodedCommand<IExecutedPushedCommand>[] =
            [...frontendState.executedPushedCommands];
          const failedStagedCommands: IEncodedCommand<IFailedStagedCommand>[] =
            [];
          const failedPushedCommands: IEncodedCommand<IFailedPushedCommand>[] =
            [...frontendState.failedPushedCommands];
          const optimisticAppliedMutations: Array<{
            commandId: IEncodedCommand<IStagedCommand>['id'];
            mutations: readonly IEncodedAppliedMutation[];
          }> = [];
          const journalReceipts: Array<{
            journalId: (typeof accountFrontendCommandJournal.$inferSelect)['id'];
            mutations: readonly IEncodedAppliedMutation[];
          }> = [];
          const localPushedJournalRows: typeof rebuildJournalRows = [];
          for (const journalRow of rebuildJournalRows) {
            if (
              journalRow.lifecycle !== 'pushed' ||
              journalRow.pushProvenance === null ||
              frontendState.pushedCommands.some(
                command => command.id === journalRow.commandId,
              ) ||
              frontendState.executedPushedCommands.some(
                command => command.id === journalRow.commandId,
              ) ||
              frontendState.failedPushedCommands.some(
                command => command.id === journalRow.commandId,
              )
            ) {
              continue;
            }
            const pushedCommand = Schema.decodeUnknownSync(
              Schema.parseJson(PushedCommandSchema),
            )(journalRow.pushProvenance);
            if (
              frontendState.lastRebasedPushedCursor !== null &&
              pushedCommand.pushedCursor <=
                frontendState.lastRebasedPushedCursor
            ) {
              continue;
            }
            localPushedJournalRows.push(journalRow);
          }
          const localStagedJournalRows = rebuildJournalRows.filter(
            row =>
              (row.lifecycle === 'staged' || row.lifecycle === 'pushing') &&
              !frontendState.pushedCommands.some(
                command => command.id === row.commandId,
              ) &&
              !frontendState.executedPushedCommands.some(
                command => command.id === row.commandId,
              ) &&
              !frontendState.failedPushedCommands.some(
                command => command.id === row.commandId,
              ),
          );

          const replacement = await runtime.runPromise(
            makeTxAsync({
              db: rebuiltDb,
              program: ({ tx }) =>
                Effect.tryPromise({
                  try: async () => {
                    await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
                    for (const resource of frontendState.resources) {
                      const resourceSchema =
                        this.resourceSchemas[resource.modelName];
                      if (resourceSchema === undefined) {
                        throw new ZerospinError({
                          code: 'account-frontend-replica-resource-model-missing',
                          message: `State resource model "${resource.modelName}" is not in the acquired spec`,
                        });
                      }
                      await tx.insert(resourceSchema).values(resource).run();
                    }

                    for (const journalRow of localPushedJournalRows) {
                      const pushedCommand = Schema.decodeUnknownSync(
                        Schema.parseJson(PushedCommandSchema),
                      )(journalRow.pushProvenance);
                      const applied = await this.applyEncodedMutations({
                        tx,
                        commandId: pushedCommand.id,
                        mutations: Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedFrontendMutationSchema),
                          ),
                        )(journalRow.mutations),
                        appliedAt: new Date(journalRow.stagedAt),
                      });
                      pushedCommands.push(pushedCommand);
                      optimisticAppliedMutations.push({
                        commandId: pushedCommand.id,
                        mutations: applied.appliedMutations,
                      });
                      journalReceipts.push({
                        journalId: journalRow.id,
                        mutations: applied.appliedMutations,
                      });
                    }

                    for (const journalRow of localStagedJournalRows) {
                      const command = Schema.decodeUnknownSync(
                        Schema.parseJson(StagedCommandSchema),
                      )(journalRow.command);
                      const applied = await this.applyEncodedMutations({
                        tx,
                        commandId: command.id,
                        mutations: Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedFrontendMutationSchema),
                          ),
                        )(journalRow.mutations),
                        appliedAt: new Date(journalRow.stagedAt),
                      });
                      stagedCommands.push(command);
                      optimisticAppliedMutations.push({
                        commandId: command.id,
                        mutations: applied.appliedMutations,
                      });
                      journalReceipts.push({
                        journalId: journalRow.id,
                        mutations: applied.appliedMutations,
                      });
                    }

                    for (const journalRow of rebuildJournalRows) {
                      if (
                        journalRow.lifecycle !== 'failed' ||
                        journalRow.terminalOutcome === null
                      ) {
                        continue;
                      }
                      const terminalOutcome = Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Union(
                            ExecutedPushedCommandSchema,
                            FailedStagedCommandSchema,
                            FailedPushedCommandSchema,
                          ),
                        ),
                      )(journalRow.terminalOutcome);
                      if (terminalOutcome.status === 'executed') {
                        if (
                          !executedPushedCommands.some(
                            command => command.id === terminalOutcome.id,
                          )
                        ) {
                          executedPushedCommands.push(terminalOutcome);
                        }
                      } else if ('pushedAt' in terminalOutcome) {
                        if (
                          !failedPushedCommands.some(
                            command => command.id === terminalOutcome.id,
                          )
                        ) {
                          failedPushedCommands.push(terminalOutcome);
                        }
                      } else {
                        failedStagedCommands.push(terminalOutcome);
                      }
                    }

                    const state: IFrontendReplicaState = {
                      ...frontendState,
                      frontendVersion: this.catalogRow.frontendVersion,
                      replicaIndex,
                      resources: await this.collectResources(tx),
                      stagedCommands,
                      pushedCommands,
                      executedPushedCommands,
                      failedStagedCommands,
                      failedPushedCommands,
                      optimisticAppliedMutations,
                    };
                    await tx
                      .insert(accountReplicaState)
                      .values({
                        id: 'arps_current',
                        state: Schema.encodeUnknownSync(
                          Schema.parseJson(FrontendReplicaStateSchema),
                        )(state),
                        previousBlock: null,
                      })
                      .run();
                    return state;
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'rebuild-account-frontend-replica-failed',
                          message:
                            'Failed to transactionally rebuild account frontend replica',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                }).pipe(Effect.withSpan('rebuildAccountReplicaFromServer')),
            }),
          );

          const encodedPreviousDatabaseNames = Schema.encodeUnknownSync(
            Schema.parseJson(Schema.Array(Schema.String)),
          )([...previousDatabaseNames, oldDatabaseName]);
          await runtime.runPromise(
            makeTxAsync({
              db: this.partitionStore.db,
              program: ({ tx }) =>
                Effect.tryPromise({
                  try: async () => {
                    for (const receipt of journalReceipts) {
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          appliedMutations: Schema.encodeUnknownSync(
                            Schema.parseJson(
                              Schema.Array(EncodedAppliedMutationSchema),
                            ),
                          )(receipt.mutations),
                          materializedReplicaIndex: replicaIndex,
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(
                            accountFrontendCommandJournal.id,
                            receipt.journalId,
                          ),
                        )
                        .run();
                    }
                    for (const journalRow of rebuildJournalRows) {
                      if (journalRow.lifecycle !== 'transport-uncertain') {
                        continue;
                      }
                      const pendingCommand = frontendState.pushedCommands.find(
                        command => command.id === journalRow.commandId,
                      );
                      if (pendingCommand !== undefined) {
                        await tx
                          .update(accountFrontendCommandJournal)
                          .set({
                            command: Schema.encodeUnknownSync(
                              Schema.parseJson(PushedCommandSchema),
                            )(pendingCommand),
                            lifecycle: 'pushed',
                            pushProvenance: Schema.encodeUnknownSync(
                              Schema.parseJson(PushedCommandSchema),
                            )(pendingCommand),
                            updatedAt: new Date(),
                          })
                          .where(
                            eq(accountFrontendCommandJournal.id, journalRow.id),
                          )
                          .run();
                        continue;
                      }
                      const executedCommand =
                        frontendState.executedPushedCommands.find(
                          command => command.id === journalRow.commandId,
                        );
                      if (executedCommand !== undefined) {
                        await tx
                          .update(accountFrontendCommandJournal)
                          .set({
                            command: Schema.encodeUnknownSync(
                              Schema.parseJson(ExecutedPushedCommandSchema),
                            )(executedCommand),
                            lifecycle: 'pushed',
                            terminalOutcome: Schema.encodeUnknownSync(
                              Schema.parseJson(ExecutedPushedCommandSchema),
                            )(executedCommand),
                            updatedAt: new Date(),
                          })
                          .where(
                            eq(accountFrontendCommandJournal.id, journalRow.id),
                          )
                          .run();
                        continue;
                      }
                      const failedCommand =
                        frontendState.failedPushedCommands.find(
                          command => command.id === journalRow.commandId,
                        );
                      if (failedCommand !== undefined) {
                        await tx
                          .update(accountFrontendCommandJournal)
                          .set({
                            command: Schema.encodeUnknownSync(
                              Schema.parseJson(FailedPushedCommandSchema),
                            )(failedCommand),
                            lifecycle: 'failed',
                            terminalOutcome: Schema.encodeUnknownSync(
                              Schema.parseJson(FailedPushedCommandSchema),
                            )(failedCommand),
                            updatedAt: new Date(),
                          })
                          .where(
                            eq(accountFrontendCommandJournal.id, journalRow.id),
                          )
                          .run();
                        continue;
                      }
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({ lifecycle: 'dormant', updatedAt: new Date() })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                    }
                    await tx
                      .update(accountFrontendReplicas)
                      .set({
                        databaseName: rebuiltDatabaseName,
                        previousDatabaseNames: encodedPreviousDatabaseNames,
                        status: 'ready',
                        replicaIndex,
                        frontendIndex: frontendState.frontendIndex,
                        systemVersion: frontendState.systemVersion,
                        systemWorkerName: frontendState.systemWorkerName,
                        journalHealth: 'healthy',
                        lastFailure: null,
                        updatedAt: new Date(),
                      })
                      .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                      .run();
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'commit-account-frontend-replica-repoint-failed',
                          message:
                            'Failed to atomically repoint rebuilt account frontend replica',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                }).pipe(Effect.withSpan('commitAccountReplicaRepoint')),
            }),
          );

          this.db = rebuiltDb;
          this.catalogRow.databaseName = rebuiltDatabaseName;
          this.catalogRow.previousDatabaseNames = encodedPreviousDatabaseNames;
          this.catalogRow.status = 'ready';
          this.catalogRow.replicaIndex = replicaIndex;
          this.catalogRow.frontendIndex = frontendState.frontendIndex;
          this.catalogRow.systemVersion = frontendState.systemVersion;
          this.catalogRow.systemWorkerName = frontendState.systemWorkerName;
          this.catalogRow.journalHealth = 'healthy';
          this.catalogRow.lastFailure = null;
          return replacement;
        } catch (cause) {
          const failure = ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'rebuild-account-frontend-replica-failed',
                message:
                  'Failed to rebuild account frontend replica while preserving the prior database',
                cause: ZerospinError.prettyUnknownFailure(cause),
              });
          await this.partitionStore.db
            .update(accountFrontendReplicas)
            .set({
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          throw failure;
        }
      }
    }

    async acquire(props: {
      provider: AccountFrontendReplicaProviderApi;
      authority: 'online' | 'cached-offline';
      role: 'active' | 'commissioned';
      ownerToken: object;
    }): Promise<string> {
      const existing = this.providers.find(
        registration =>
          registration.ownerToken === props.ownerToken &&
          !registration.released,
      );
      if (existing !== undefined) {
        if (props.authority === 'online') existing.authority = 'online';
        if (props.role === 'active') existing.role = 'active';
        if (
          props.role === 'active' &&
          this.catalogRow.role === 'commissioned'
        ) {
          await this.partitionStore.db
            .update(accountFrontendReplicas)
            .set({ role: 'active', updatedAt: new Date() })
            .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.role = 'active';
        }
        if (props.authority === 'online') {
          setTimeout(() => {
            void this.connectSocket();
          }, 0);
        }
        if (props.role === 'active') {
          // Commissioning imports every dormant command before promotion.
          // Once promotion commits, retry the now-authorized journal even when
          // the commissioned socket was already online and will not replay.
          setTimeout(() => {
            void this.serialize(() => this.pushJournalCommands());
          }, 0);
        }
        return existing.id;
      }

      nextRegistrationId += 1;
      const registrationId = `account-provider-${nextRegistrationId}`;
      const snapshot = await this.getSnapshot();
      if (props.role === 'active' && this.catalogRow.role === 'commissioned') {
        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({ role: 'active', updatedAt: new Date() })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.role = 'active';
      }
      const retainedProvider =
        props.provider instanceof RpcStub
          ? props.provider.dup()
          : props.provider;
      this.providers.push({
        id: registrationId,
        provider: retainedProvider,
        authority: props.authority,
        role: props.role,
        registeredAt: Date.now(),
        ownerToken: props.ownerToken,
        gateOpen: false,
        stateRequested: false,
        capturedSnapshot: snapshot,
        bufferedBlocks: [],
        released: false,
      });
      if (props.authority === 'online') {
        setTimeout(() => {
          void this.connectSocket();
        }, 0);
      }
      if (props.role === 'active') {
        setTimeout(() => {
          void this.serialize(() => this.pushJournalCommands());
        }, 0);
      }
      return registrationId;
    }

    async getAcquiredState(
      registrationId: string,
    ): Promise<IFrontendReplicaState> {
      return this.serialize(async () => {
        const registration = this.providers.find(
          candidate => candidate.id === registrationId && !candidate.released,
        );
        if (registration === undefined) {
          throw new ZerospinError({
            code: 'account-frontend-replica-acquisition-released',
            message: 'Account frontend replica acquisition is released',
          });
        }

        if (registration.stateRequested) {
          return this.getSnapshot();
        }

        registration.stateRequested = true;
        const capturedSnapshot = registration.capturedSnapshot;
        setTimeout(() => {
          void this.serialize(async () => {
            if (registration.released) return;
            registration.gateOpen = true;
            const bufferedBlocks = registration.bufferedBlocks;
            registration.bufferedBlocks = [];
            for (const bufferedBlock of bufferedBlocks) {
              try {
                await runtime.runPromise(
                  decodeRpc(
                    await registration.provider.handleFrontendReplicaBlock(
                      bufferedBlock,
                    ),
                  ),
                );
              } catch {
                try {
                  await runtime.runPromise(
                    decodeRpc(
                      await registration.provider.replaceFrontendState(
                        await this.getSnapshot(),
                      ),
                    ),
                  );
                } catch {
                  registration.released = true;
                  if (registration.provider instanceof RpcStub) {
                    registration.provider[Symbol.dispose]();
                  }
                  registration.bufferedBlocks = [];
                  break;
                }
              }
            }
            if (this.providers.every(candidate => candidate.released)) {
              this.socket?.close();
              this.socket = null;
              if (this.reconnectFiber !== null) {
                runtime.runFork(Fiber.interrupt(this.reconnectFiber));
                this.reconnectFiber = null;
              }
              await this.partitionStore.db
                .update(accountFrontendReplicas)
                .set({ socketState: 'disconnected', updatedAt: new Date() })
                .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                .run();
              this.catalogRow.socketState = 'disconnected';
            }
          });
        }, 0);
        return capturedSnapshot;
      });
    }

    async release(registrationId: string): Promise<void> {
      await this.serialize(async () => {
        const registration = this.providers.find(
          candidate => candidate.id === registrationId,
        );
        if (registration === undefined || registration.released) return;
        registration.released = true;
        if (registration.provider instanceof RpcStub) {
          registration.provider[Symbol.dispose]();
        }
        registration.bufferedBlocks = [];
        if (this.providers.every(candidate => candidate.released)) {
          this.socket?.close();
          this.socket = null;
          if (this.reconnectFiber !== null) {
            runtime.runFork(Fiber.interrupt(this.reconnectFiber));
            this.reconnectFiber = null;
          }
          await this.partitionStore.db
            .update(accountFrontendReplicas)
            .set({ socketState: 'disconnected', updatedAt: new Date() })
            .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.socketState = 'disconnected';
        }
      });
    }

    async releaseOwner(ownerToken: object): Promise<void> {
      const registrations = this.providers.filter(
        candidate => candidate.ownerToken === ownerToken && !candidate.released,
      );
      for (const registration of registrations) {
        await this.release(registration.id);
      }
    }

    async fanoutBlock(block: IFrontendReplicaBlock): Promise<void> {
      for (const registration of this.providers) {
        if (registration.released) continue;
        if (!registration.gateOpen) {
          registration.bufferedBlocks.push(block);
          continue;
        }
        try {
          await runtime.runPromise(
            decodeRpc(
              await registration.provider.handleFrontendReplicaBlock(block),
            ),
          );
        } catch {
          try {
            await runtime.runPromise(
              decodeRpc(
                await registration.provider.replaceFrontendState(
                  await this.getSnapshot(),
                ),
              ),
            );
          } catch {
            registration.released = true;
            if (registration.provider instanceof RpcStub) {
              registration.provider[Symbol.dispose]();
            }
            registration.bufferedBlocks = [];
          }
        }
      }
      if (this.providers.every(candidate => candidate.released)) {
        this.socket?.close();
        this.socket = null;
        if (this.reconnectFiber !== null) {
          runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({ socketState: 'disconnected', updatedAt: new Date() })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'disconnected';
      }
    }

    async fanoutReplacement(state: IFrontendReplicaState): Promise<void> {
      for (const registration of this.providers) {
        if (registration.released || !registration.gateOpen) continue;
        try {
          await runtime.runPromise(
            decodeRpc(await registration.provider.replaceFrontendState(state)),
          );
        } catch {
          registration.released = true;
          if (registration.provider instanceof RpcStub) {
            registration.provider[Symbol.dispose]();
          }
          registration.bufferedBlocks = [];
        }
      }
      if (this.providers.every(candidate => candidate.released)) {
        this.socket?.close();
        this.socket = null;
        if (this.reconnectFiber !== null) {
          runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({ socketState: 'disconnected', updatedAt: new Date() })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'disconnected';
      }
    }

    async repairFromProvider(): Promise<void> {
      const providers = this.providers
        .filter(
          registration =>
            !registration.released && registration.authority === 'online',
        )
        .sort((left, right) => left.registeredAt - right.registeredAt);
      let lastFailure: unknown;
      for (const registration of providers) {
        try {
          const frontendStateOutcome = await runtime.runPromise(
            decodeRpc(await registration.provider.getFrontendState()).pipe(
              Effect.either,
            ),
          );
          if (Either.isLeft(frontendStateOutcome)) {
            throw frontendStateOutcome.left;
          }
          const frontendState = frontendStateOutcome.right;
          const replacement = await this.replaceFromServer(frontendState);
          await this.fanoutReplacement(replacement);
          return;
        } catch (cause) {
          lastFailure = cause;
          if (
            ZerospinError.isZerospinError(cause) &&
            cause.code === 'frontend-version-changed'
          ) {
            await this.partitionStore.db
              .update(accountFrontendCommandJournal)
              .set({ lifecycle: 'dormant', updatedAt: new Date() })
              .where(
                and(
                  eq(
                    accountFrontendCommandJournal.accountId,
                    this.catalogRow.accountId,
                  ),
                  eq(
                    accountFrontendCommandJournal.accountName,
                    this.catalogRow.accountName,
                  ),
                  eq(
                    accountFrontendCommandJournal.actorId,
                    this.catalogRow.actorId,
                  ),
                  eq(
                    accountFrontendCommandJournal.actorName,
                    this.catalogRow.actorName,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendName,
                    this.catalogRow.frontendName,
                  ),
                  inArray(accountFrontendCommandJournal.lifecycle, [
                    'staged',
                    'pushing',
                    'transport-uncertain',
                  ]),
                ),
              )
              .run();
            const encodedVersionFailure = ZerospinError.stringify(cause);
            await this.partitionStore.db
              .update(accountFrontendReplicas)
              .set({
                writeSuspended: true,
                lastFailure: encodedVersionFailure,
                updatedAt: new Date(),
              })
              .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
              .run();
            this.isFrontendVersionUpdateRequired = true;
            this.catalogRow.writeSuspended = true;
            this.catalogRow.lastFailure = encodedVersionFailure;
          }
          if (
            !ZerospinError.isZerospinError(cause) ||
            String(cause.code).includes('authentication')
          ) {
            registration.released = true;
            if (registration.provider instanceof RpcStub) {
              registration.provider[Symbol.dispose]();
            }
            registration.bufferedBlocks = [];
          }
        }
      }
      if (this.providers.every(candidate => candidate.released)) {
        this.socket?.close();
        this.socket = null;
        if (this.reconnectFiber !== null) {
          runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({ socketState: 'disconnected', updatedAt: new Date() })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'disconnected';
      }
      throw ZerospinError.isZerospinError(lastFailure)
        ? lastFailure
        : new ZerospinError({
            code: 'account-frontend-replica-repair-failed',
            message: 'No online account provider could repair the replica',
            cause: ZerospinError.prettyUnknownFailure(lastFailure),
          });
    }

    async scheduleReconnect(): Promise<void> {
      if (
        this.reconnectFiber !== null ||
        this.isTransitionRequired ||
        !this.providers.some(
          registration =>
            !registration.released && registration.authority === 'online',
        )
      ) {
        return;
      }
      const reconnectAttempt = this.catalogRow.reconnectAttempt + 1;
      const delay = Math.min(
        30_000,
        250 * 2 ** this.catalogRow.reconnectAttempt,
      );
      await this.partitionStore.db
        .update(accountFrontendReplicas)
        .set({
          socketState: 'disconnected',
          reconnectAttempt,
          updatedAt: new Date(),
        })
        .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
        .run();
      this.catalogRow.socketState = 'disconnected';
      this.catalogRow.reconnectAttempt = reconnectAttempt;
      this.reconnectFiber = runtime.runFork(
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

    async connectSocket(): Promise<void> {
      await this.serialize(async () => {
        if (
          this.socket !== null ||
          this.isTransitionRequired ||
          !this.providers.some(
            registration =>
              !registration.released && registration.authority === 'online',
          )
        ) {
          return;
        }

        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({ socketState: 'connecting', updatedAt: new Date() })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'connecting';

        const providers = this.providers
          .filter(
            registration =>
              !registration.released && registration.authority === 'online',
          )
          .sort((left, right) => left.registeredAt - right.registeredAt);
        let selectedTicket:
          | Readonly<{
              ticket: string;
              systemId: ISystemId;
              generationId: string;
              accountId: IAccountId;
              accountName: string;
              actorId: IActorId;
              actorName: string;
              frontendName: string;
              frontendVersion: string;
            }>
          | undefined;
        let selectedRegistration: (typeof this.providers)[number] | undefined;
        let lastFailure: unknown;
        for (const registration of providers) {
          try {
            const ticketOutcome = await runtime.runPromise(
              decodeRpc(
                await registration.provider.createFrontendWebSocketTicket(),
              ).pipe(Effect.either),
            );
            if (Either.isLeft(ticketOutcome)) {
              throw ticketOutcome.left;
            }
            const ticket = ticketOutcome.right;
            if (
              ticket.systemId !== systemId ||
              ticket.accountId !== this.catalogRow.accountId ||
              ticket.accountName !== this.catalogRow.accountName ||
              ticket.actorId !== this.catalogRow.actorId ||
              ticket.actorName !== this.catalogRow.actorName ||
              ticket.frontendName !== this.catalogRow.frontendName
            ) {
              registration.released = true;
              if (registration.provider instanceof RpcStub) {
                registration.provider[Symbol.dispose]();
              }
              registration.bufferedBlocks = [];
              lastFailure = new ZerospinError({
                code: 'account-frontend-websocket-ticket-target-mismatch',
                message:
                  'Fresh account frontend WebSocket ticket targets another actor or frontend',
              });
              continue;
            }
            if (
              ticket.generationId === generationId &&
              ticket.frontendVersion !== this.catalogRow.frontendVersion
            ) {
              const versionFailure = new ZerospinError({
                code: 'frontend-version-changed',
                message:
                  'Authoritative account frontend version changed within the current generation',
                extra: {
                  generationId,
                  sourceFrontendVersion: this.catalogRow.frontendVersion,
                  targetFrontendVersion: ticket.frontendVersion,
                },
              });
              const encodedVersionFailure =
                ZerospinError.stringify(versionFailure);
              await runtime.runPromise(
                makeTxAsync({
                  db: this.partitionStore.db,
                  program: ({ tx }) =>
                    Effect.tryPromise({
                      try: async () => {
                        await tx
                          .update(accountFrontendCommandJournal)
                          .set({ lifecycle: 'dormant', updatedAt: new Date() })
                          .where(
                            and(
                              eq(
                                accountFrontendCommandJournal.accountId,
                                this.catalogRow.accountId,
                              ),
                              eq(
                                accountFrontendCommandJournal.accountName,
                                this.catalogRow.accountName,
                              ),
                              eq(
                                accountFrontendCommandJournal.actorId,
                                this.catalogRow.actorId,
                              ),
                              eq(
                                accountFrontendCommandJournal.actorName,
                                this.catalogRow.actorName,
                              ),
                              eq(
                                accountFrontendCommandJournal.frontendName,
                                this.catalogRow.frontendName,
                              ),
                              inArray(accountFrontendCommandJournal.lifecycle, [
                                'staged',
                                'pushing',
                                'transport-uncertain',
                              ]),
                              or(
                                and(
                                  eq(
                                    accountFrontendCommandJournal.journalKind,
                                    'source',
                                  ),
                                  eq(
                                    accountFrontendCommandJournal.sourceGenerationId,
                                    generationId,
                                  ),
                                  eq(
                                    accountFrontendCommandJournal.frontendVersion,
                                    this.catalogRow.frontendVersion,
                                  ),
                                ),
                                and(
                                  eq(
                                    accountFrontendCommandJournal.journalKind,
                                    'adapted',
                                  ),
                                  eq(
                                    accountFrontendCommandJournal.targetGenerationId,
                                    generationId,
                                  ),
                                  eq(
                                    accountFrontendCommandJournal.targetFrontendVersion,
                                    this.catalogRow.frontendVersion,
                                  ),
                                ),
                              ),
                            ),
                          )
                          .run();
                        await tx
                          .update(accountFrontendReplicas)
                          .set({
                            writeSuspended: true,
                            lastFailure: encodedVersionFailure,
                            updatedAt: new Date(),
                          })
                          .where(
                            eq(accountFrontendReplicas.id, this.catalogRow.id),
                          )
                          .run();
                      },
                      catch: ZerospinError.catch({
                        code: 'persist-account-frontend-version-change-failed',
                        message:
                          'Failed to suspend the account replica for an authoritative frontend version change',
                      }),
                    }),
                }),
              );
              this.isFrontendVersionUpdateRequired = true;
              this.catalogRow.writeSuspended = true;
              this.catalogRow.lastFailure = encodedVersionFailure;
            }
            selectedTicket = ticket;
            selectedRegistration = registration;
            break;
          } catch (cause) {
            lastFailure = cause;
            if (
              !ZerospinError.isZerospinError(cause) ||
              String(cause.code).includes('authentication')
            ) {
              registration.released = true;
              if (registration.provider instanceof RpcStub) {
                registration.provider[Symbol.dispose]();
              }
              registration.bufferedBlocks = [];
            }
          }
        }

        if (
          selectedTicket === undefined ||
          selectedRegistration === undefined
        ) {
          const failure = ZerospinError.isZerospinError(lastFailure)
            ? lastFailure
            : new ZerospinError({
                code: 'account-frontend-websocket-ticket-failed',
                message:
                  'No online account provider could mint a WebSocket ticket',
                cause: ZerospinError.prettyUnknownFailure(lastFailure),
              });
          await this.partitionStore.db
            .update(accountFrontendReplicas)
            .set({
              socketState: 'disconnected',
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.socketState = 'disconnected';
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          await this.scheduleReconnect();
          return;
        }

        const socketUrl = new URL(sharedWorkerApiUrl);
        if (socketUrl.protocol === 'https:') {
          socketUrl.protocol = 'wss:';
        } else if (socketUrl.protocol === 'http:') {
          socketUrl.protocol = 'ws:';
        } else {
          throw new ZerospinError({
            code: 'account-frontend-websocket-url-invalid',
            message: 'SharedWorker API URL must use http or https',
          });
        }
        socketUrl.pathname = '/ws-frontend-blocks';
        socketUrl.search = '';
        socketUrl.searchParams.set(
          'publishableKey',
          sharedWorkerPublishableKey,
        );
        socketUrl.searchParams.set('ticket', selectedTicket.ticket);

        let socket: WebSocket;
        try {
          socket = new WebSocket(socketUrl.toString());
        } catch (cause) {
          const failure = new ZerospinError({
            code: 'account-frontend-websocket-construction-failed',
            message: 'Failed to construct account frontend WebSocket',
            cause: ZerospinError.prettyUnknownFailure(cause),
          });
          await this.partitionStore.db
            .update(accountFrontendReplicas)
            .set({
              socketState: 'disconnected',
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.socketState = 'disconnected';
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          await this.scheduleReconnect();
          return;
        }
        this.socket = socket;

        socket.addEventListener('open', () => {
          void this.serialize(async () => {
            if (this.socket !== socket || selectedRegistration.released) {
              socket.close();
              return;
            }
            const snapshot = await this.getSnapshot();
            await this.partitionStore.db
              .update(accountFrontendReplicas)
              .set({ socketState: 'replaying', updatedAt: new Date() })
              .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
              .run();
            this.catalogRow.socketState = 'replaying';
            socket.send(
              JSON.stringify({
                replicaGenerationId: snapshot.generationId,
                frontendIndex: snapshot.frontendIndex,
              }),
            );
          });
        });

        socket.addEventListener('message', event => {
          void (async () => {
            try {
              const message = Schema.decodeUnknownSync(
                accountFrontendSocketMessageSchema,
              )(String(event.data), { onExcessProperty: 'error' });
              if (message.type === 'frontendBlock') {
                await this.applyServerLineageBlock(message.sync);
              } else {
                await this.serialize(async () => {
                  if (this.socket !== socket) return;
                  const snapshot = await this.getSnapshot();
                  if (message.type === 'replay-complete') {
                    if (
                      message.generationId !== snapshot.generationId ||
                      message.frontendIndex !== snapshot.frontendIndex
                    ) {
                      throw new ZerospinError({
                        code: 'account-frontend-websocket-replay-watermark-mismatch',
                        message:
                          'Replay completion does not match the committed account watermark',
                      });
                    }
                    await this.partitionStore.db
                      .update(accountFrontendReplicas)
                      .set({
                        socketState: 'online',
                        reconnectAttempt: 0,
                        lastFailure: this.isFrontendVersionUpdateRequired
                          ? this.catalogRow.lastFailure
                          : null,
                        updatedAt: new Date(),
                      })
                      .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                      .run();
                    this.catalogRow.socketState = 'online';
                    this.catalogRow.reconnectAttempt = 0;
                    if (!this.isFrontendVersionUpdateRequired) {
                      this.catalogRow.lastFailure = null;
                    }
                    setTimeout(() => {
                      void this.serialize(() => this.pushJournalCommands());
                    }, 0);
                    return;
                  }
                  if (message.type === 'state-required') {
                    if (
                      message.systemId !== snapshot.systemId ||
                      message.generationId !== snapshot.generationId ||
                      message.accountId !== snapshot.accountId ||
                      message.accountName !== snapshot.accountName ||
                      message.actorId !== snapshot.actorId ||
                      message.actorName !== snapshot.actorName ||
                      message.frontendName !== snapshot.frontendName ||
                      message.frontendVersion !== snapshot.frontendVersion
                    ) {
                      throw new ZerospinError({
                        code: 'account-frontend-websocket-state-required-target-mismatch',
                        message:
                          'State-required control targets another account replica',
                      });
                    }
                    await this.repairFromProvider();
                    socket.close();
                    return;
                  }
                  const transitionStateRow = await this.db
                    .select()
                    .from(accountReplicaState)
                    .where(eq(accountReplicaState.id, 'arps_current'))
                    .get();
                  const appliedTransitionBlock =
                    transitionStateRow?.previousBlock === null ||
                    transitionStateRow?.previousBlock === undefined
                      ? null
                      : Schema.decodeUnknownSync(
                          Schema.parseJson(FrontendReplicaBlockSchema),
                        )(transitionStateRow.previousBlock, {
                          onExcessProperty: 'error',
                        });
                  if (
                    message.systemId !== snapshot.systemId ||
                    message.accountId !== snapshot.accountId ||
                    message.accountName !== snapshot.accountName ||
                    message.actorId !== snapshot.actorId ||
                    message.actorName !== snapshot.actorName ||
                    message.frontendName !== snapshot.frontendName ||
                    message.appliedBoundaryIndex !== snapshot.frontendIndex ||
                    appliedTransitionBlock?.kind !== 'server' ||
                    appliedTransitionBlock.systemId !== snapshot.systemId ||
                    appliedTransitionBlock.generationId !==
                      snapshot.generationId ||
                    appliedTransitionBlock.accountId !== snapshot.accountId ||
                    appliedTransitionBlock.accountName !==
                      snapshot.accountName ||
                    appliedTransitionBlock.actorId !== snapshot.actorId ||
                    appliedTransitionBlock.actorName !== snapshot.actorName ||
                    appliedTransitionBlock.frontendName !==
                      snapshot.frontendName ||
                    appliedTransitionBlock.frontendVersion !==
                      snapshot.frontendVersion ||
                    appliedTransitionBlock.replicaIndex !==
                      snapshot.replicaIndex ||
                    appliedTransitionBlock.frontendIndex !==
                      message.appliedBoundaryIndex ||
                    appliedTransitionBlock.lineageBlock.kind !==
                      'generation-boundary' ||
                    appliedTransitionBlock.lineageBlock.systemId !==
                      snapshot.systemId ||
                    appliedTransitionBlock.lineageBlock.prevGenerationId !==
                      snapshot.generationId ||
                    appliedTransitionBlock.lineageBlock.generationId ===
                      snapshot.generationId ||
                    appliedTransitionBlock.lineageBlock.accountId !==
                      snapshot.accountId ||
                    appliedTransitionBlock.lineageBlock.accountName !==
                      snapshot.accountName ||
                    appliedTransitionBlock.lineageBlock.actorId !==
                      snapshot.actorId ||
                    appliedTransitionBlock.lineageBlock.actorName !==
                      snapshot.actorName ||
                    appliedTransitionBlock.lineageBlock.frontendName !==
                      snapshot.frontendName ||
                    appliedTransitionBlock.lineageBlock.frontendIndex !==
                      message.appliedBoundaryIndex
                  ) {
                    throw new ZerospinError({
                      code: 'account-frontend-lineage-transition-boundary-unproven',
                      message:
                        'Lineage transition control does not match the applied account generation boundary',
                    });
                  }
                  let previousBoundaryGenerationId =
                    appliedTransitionBlock.lineageBlock.generationId;
                  let previousBoundaryIndex =
                    appliedTransitionBlock.lineageBlock.frontendIndex;
                  const visitedBoundaryGenerationIds = new Set<string>([
                    snapshot.generationId,
                    previousBoundaryGenerationId,
                  ]);
                  for (const remainingBoundary of message.remainingBoundaries) {
                    if (
                      remainingBoundary.systemId !== snapshot.systemId ||
                      remainingBoundary.prevGenerationId !==
                        previousBoundaryGenerationId ||
                      remainingBoundary.generationId ===
                        previousBoundaryGenerationId ||
                      visitedBoundaryGenerationIds.has(
                        remainingBoundary.generationId,
                      ) ||
                      remainingBoundary.accountId !== snapshot.accountId ||
                      remainingBoundary.accountName !== snapshot.accountName ||
                      remainingBoundary.actorId !== snapshot.actorId ||
                      remainingBoundary.actorName !== snapshot.actorName ||
                      remainingBoundary.frontendName !==
                        snapshot.frontendName ||
                      remainingBoundary.frontendIndex <= previousBoundaryIndex
                    ) {
                      throw new ZerospinError({
                        code: 'account-frontend-lineage-transition-boundary-chain-invalid',
                        message:
                          'Account transition descriptors do not form one ordered canonical lineage',
                      });
                    }
                    previousBoundaryGenerationId =
                      remainingBoundary.generationId;
                    previousBoundaryIndex = remainingBoundary.frontendIndex;
                    visitedBoundaryGenerationIds.add(
                      remainingBoundary.generationId,
                    );
                  }
                  if (previousBoundaryGenerationId !== message.generationId) {
                    throw new ZerospinError({
                      code: 'account-frontend-lineage-transition-boundary-target-mismatch',
                      message:
                        'Account transition descriptors do not reach the requested target generation',
                    });
                  }
                  this.isTransitionRequired = true;
                  const transition = Schema.encodeUnknownSync(
                    Schema.parseJson(FrontendLineageTransitionRequiredSchema),
                  )(message);
                  await this.partitionStore.db
                    .update(accountFrontendReplicas)
                    .set({
                      pendingTransition: transition,
                      writeSuspended: true,
                      socketState: 'disconnected',
                      updatedAt: new Date(),
                    })
                    .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                    .run();
                  this.catalogRow.pendingTransition = transition;
                  this.catalogRow.writeSuspended = true;
                  this.catalogRow.socketState = 'disconnected';
                  socket.close();
                });
              }
            } catch (cause) {
              await this.serialize(async () => {
                const failure = ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'account-frontend-websocket-message-failed',
                      message:
                        'Failed to process account frontend WebSocket message',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    });
                await this.partitionStore.db
                  .update(accountFrontendReplicas)
                  .set({
                    socketState: 'disconnected',
                    lastFailure: ZerospinError.stringify(failure),
                    updatedAt: new Date(),
                  })
                  .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                  .run();
                this.catalogRow.socketState = 'disconnected';
                this.catalogRow.lastFailure = ZerospinError.stringify(failure);
                try {
                  await this.repairFromProvider();
                } catch {
                  // The persisted failure remains authoritative until a provider can repair.
                }
                socket.close();
              });
            }
          })();
        });

        socket.addEventListener('error', () => {
          socket.close();
        });
        socket.addEventListener('close', () => {
          void this.serialize(async () => {
            if (this.socket !== socket) return;
            this.socket = null;
            await this.partitionStore.db
              .update(accountFrontendReplicas)
              .set({ socketState: 'disconnected', updatedAt: new Date() })
              .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
              .run();
            this.catalogRow.socketState = 'disconnected';
            await this.scheduleReconnect();
          });
        });
      });
    }

    async applyServerLineageBlock(
      lineageBlock: IFrontendLineageBlock,
    ): Promise<void> {
      await this.serialize(async () => {
        const current = await this.getSnapshot();
        if (
          lineageBlock.systemId !== current.systemId ||
          lineageBlock.accountId !== current.accountId ||
          lineageBlock.accountName !== current.accountName ||
          lineageBlock.actorId !== current.actorId ||
          lineageBlock.actorName !== current.actorName ||
          lineageBlock.frontendName !== current.frontendName
        ) {
          throw new ZerospinError({
            code: 'account-frontend-websocket-block-target-mismatch',
            message: 'Account frontend lineage block targets another replica',
          });
        }

        const frontendIndex =
          lineageBlock.kind === 'generation-boundary'
            ? lineageBlock.frontendIndex
            : lineageBlock.frontendBlock.frontendIndex;
        const stateRow = await this.db
          .select()
          .from(accountReplicaState)
          .where(eq(accountReplicaState.id, 'arps_current'))
          .get();
        const previousBlock =
          stateRow?.previousBlock === null ||
          stateRow?.previousBlock === undefined
            ? null
            : Schema.decodeUnknownSync(
                Schema.parseJson(FrontendReplicaBlockSchema),
              )(stateRow.previousBlock);

        if (frontendIndex === current.frontendIndex) {
          if (
            previousBlock?.kind === 'server' &&
            JSON.stringify(
              Schema.encodeUnknownSync(FrontendLineageBlockSchema)(
                previousBlock.lineageBlock,
              ),
            ) ===
              JSON.stringify(
                Schema.encodeUnknownSync(FrontendLineageBlockSchema)(
                  lineageBlock,
                ),
              )
          ) {
            return;
          }
          throw new ZerospinError({
            code: 'account-frontend-websocket-block-conflicting-duplicate',
            message: 'Equal-index account frontend blocks have different bytes',
          });
        }
        if (frontendIndex !== current.frontendIndex + 1) {
          throw new ZerospinError({
            code: 'account-frontend-websocket-block-index-gap',
            message:
              'Account frontend lineage block is not the exact next index',
            extra: {
              currentFrontendIndex: current.frontendIndex,
              receivedFrontendIndex: frontendIndex,
            },
          });
        }

        if (
          lineageBlock.kind === 'generation-boundary' &&
          (lineageBlock.prevGenerationId !== current.generationId ||
            lineageBlock.generationId === current.generationId)
        ) {
          throw new ZerospinError({
            code: 'account-frontend-generation-boundary-invalid',
            message:
              'Account frontend generation boundary does not continue this replica',
          });
        }
        if (
          lineageBlock.kind === 'frontend' &&
          lineageBlock.generationId !== current.generationId
        ) {
          throw new ZerospinError({
            code: 'account-frontend-lineage-generation-mismatch',
            message:
              'Ordinary account frontend block belongs to another generation',
          });
        }

        const replicaIndex = current.replicaIndex + 1;
        const replicaBlock: IFrontendReplicaBlock = {
          kind: 'server',
          systemId: current.systemId,
          generationId: current.generationId,
          accountId: current.accountId,
          accountName: current.accountName,
          actorId: current.actorId,
          actorName: current.actorName,
          frontendName: current.frontendName,
          frontendVersion: current.frontendVersion,
          replicaIndex,
          frontendIndex,
          lineageBlock,
        };

        const journalReceipts: Array<{
          journalId: (typeof accountFrontendCommandJournal.$inferSelect)['id'];
          appliedMutations: readonly IEncodedAppliedMutation[];
        }> = [];

        if (lineageBlock.kind === 'generation-boundary') {
          const nextState: IFrontendReplicaState = {
            ...current,
            replicaIndex,
            frontendIndex,
          };
          await this.db
            .update(accountReplicaState)
            .set({
              state: Schema.encodeUnknownSync(
                Schema.parseJson(FrontendReplicaStateSchema),
              )(nextState),
              previousBlock: Schema.encodeUnknownSync(
                Schema.parseJson(FrontendReplicaBlockSchema),
              )(replicaBlock),
            })
            .where(eq(accountReplicaState.id, 'arps_current'))
            .run();
        } else {
          const frontendBlock = lineageBlock.frontendBlock;
          const terminalCommandIds = new Set<string>();
          for (const command of frontendBlock.executedPushedCommands) {
            terminalCommandIds.add(command.id);
          }
          for (const command of frontendBlock.failedPushedCommands) {
            terminalCommandIds.add(command.id);
          }

          const journalRows = await this.partitionStore.db
            .select()
            .from(accountFrontendCommandJournal)
            .where(
              and(
                eq(accountFrontendCommandJournal.accountId, current.accountId),
                eq(
                  accountFrontendCommandJournal.accountName,
                  current.accountName,
                ),
                eq(accountFrontendCommandJournal.actorId, current.actorId),
                eq(accountFrontendCommandJournal.actorName, current.actorName),
                eq(
                  accountFrontendCommandJournal.frontendName,
                  current.frontendName,
                ),
                or(
                  and(
                    eq(accountFrontendCommandJournal.journalKind, 'source'),
                    eq(
                      accountFrontendCommandJournal.sourceGenerationId,
                      generationId,
                    ),
                    eq(
                      accountFrontendCommandJournal.frontendVersion,
                      current.frontendVersion,
                    ),
                  ),
                  and(
                    eq(accountFrontendCommandJournal.journalKind, 'adapted'),
                    eq(
                      accountFrontendCommandJournal.targetGenerationId,
                      generationId,
                    ),
                    eq(
                      accountFrontendCommandJournal.targetFrontendVersion,
                      current.frontendVersion,
                    ),
                  ),
                ),
              ),
            )
            .all();

          await runtime.runPromise(
            makeTxAsync({
              db: this.db,
              program: ({ tx }) =>
                Effect.tryPromise({
                  try: async () => {
                    const stagedCommandsToRewind = [
                      ...current.stagedCommands,
                    ].sort((left, right) =>
                      right.stagedCursor.localeCompare(left.stagedCursor),
                    );
                    const pushedCommandsToRewind = [...current.pushedCommands]
                      .filter(
                        command =>
                          frontendBlock.lastRebasedPushedCursor === null ||
                          command.pushedCursor >
                            frontendBlock.lastRebasedPushedCursor,
                      )
                      .sort((left, right) =>
                        right.pushedCursor.localeCompare(left.pushedCursor),
                      );
                    for (const command of [
                      ...stagedCommandsToRewind,
                      ...pushedCommandsToRewind,
                    ]) {
                      const optimisticRow =
                        current.optimisticAppliedMutations.find(
                          candidate => candidate.commandId === command.id,
                        );
                      if (optimisticRow !== undefined) {
                        await this.reverseEncodedMutations({
                          tx,
                          mutations: optimisticRow.mutations,
                        });
                      }
                    }

                    for (const resource of [
                      ...frontendBlock.delta.inserted,
                      ...frontendBlock.delta.updated,
                    ]) {
                      const resourceSchema =
                        this.resourceSchemas[resource.modelName];
                      if (resourceSchema === undefined) {
                        throw new ZerospinError({
                          code: 'account-frontend-server-resource-model-missing',
                          message: `Server resource model "${resource.modelName}" is not in the acquired spec`,
                        });
                      }
                      const existingResource = await tx
                        .select()
                        .from(resourceSchema)
                        .where(sql`id = ${resource.id}`)
                        .get();
                      if (existingResource === undefined) {
                        await tx.insert(resourceSchema).values(resource).run();
                      } else {
                        await tx
                          .update(resourceSchema)
                          .set(resource)
                          .where(sql`id = ${resource.id}`)
                          .run();
                      }
                    }
                    for (const removedResource of frontendBlock.delta.deleted) {
                      const resourceSchema =
                        this.resourceSchemas[removedResource.modelName];
                      if (resourceSchema === undefined) {
                        throw new ZerospinError({
                          code: 'account-frontend-server-resource-model-missing',
                          message: `Server resource model "${removedResource.modelName}" is not in the acquired spec`,
                        });
                      }
                      await tx
                        .delete(resourceSchema)
                        .where(sql`id = ${removedResource.id}`)
                        .run();
                    }

                    const pushedCommands: IEncodedCommand<IPushedCommand>[] = [
                      ...frontendBlock.pendingPushedCommands,
                    ];
                    for (const command of current.pushedCommands) {
                      if (
                        terminalCommandIds.has(command.id) ||
                        pushedCommands.some(
                          candidate => candidate.id === command.id,
                        ) ||
                        (frontendBlock.lastRebasedPushedCursor !== null &&
                          command.pushedCursor <=
                            frontendBlock.lastRebasedPushedCursor)
                      ) {
                        continue;
                      }
                      pushedCommands.push(command);
                    }
                    pushedCommands.sort((left, right) =>
                      left.pushedCursor.localeCompare(right.pushedCursor),
                    );

                    const stagedCommands = current.stagedCommands.filter(
                      command => !terminalCommandIds.has(command.id),
                    );
                    const optimisticAppliedMutations: Array<{
                      commandId: IEncodedCommand<IStagedCommand>['id'];
                      mutations: readonly IEncodedAppliedMutation[];
                    }> = [];
                    for (const command of [
                      ...pushedCommands,
                      ...stagedCommands.toSorted((left, right) =>
                        left.stagedCursor.localeCompare(right.stagedCursor),
                      ),
                    ]) {
                      const journalRow = journalRows.find(
                        row => row.commandId === command.id,
                      );
                      if (journalRow === undefined) {
                        continue;
                      }
                      const mutations = Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedFrontendMutationSchema),
                        ),
                      )(journalRow.mutations);
                      const applied = await this.applyEncodedMutations({
                        tx,
                        commandId: command.id,
                        mutations,
                        appliedAt: new Date(journalRow.stagedAt),
                      });
                      optimisticAppliedMutations.push({
                        commandId: command.id,
                        mutations: applied.appliedMutations,
                      });
                      journalReceipts.push({
                        journalId: journalRow.id,
                        appliedMutations: applied.appliedMutations,
                      });
                    }

                    const executedPushedCommands: IEncodedCommand<IExecutedPushedCommand>[] =
                      [...current.executedPushedCommands];
                    for (const command of frontendBlock.executedPushedCommands) {
                      if (
                        !executedPushedCommands.some(
                          candidate => candidate.id === command.id,
                        )
                      ) {
                        executedPushedCommands.push(command);
                      }
                    }
                    const failedPushedCommands: IEncodedCommand<IFailedPushedCommand>[] =
                      [...current.failedPushedCommands];
                    for (const command of frontendBlock.failedPushedCommands) {
                      if (
                        !failedPushedCommands.some(
                          candidate => candidate.id === command.id,
                        )
                      ) {
                        failedPushedCommands.push(command);
                      }
                    }

                    const state: IFrontendReplicaState = {
                      ...current,
                      replicaIndex,
                      frontendIndex,
                      lastRebasedPushedCursor:
                        frontendBlock.lastRebasedPushedCursor,
                      resources: await this.collectResources(tx),
                      pushedCommands,
                      stagedCommands,
                      executedPushedCommands,
                      failedPushedCommands,
                      optimisticAppliedMutations,
                    };
                    await tx
                      .update(accountReplicaState)
                      .set({
                        state: Schema.encodeUnknownSync(
                          Schema.parseJson(FrontendReplicaStateSchema),
                        )(state),
                        previousBlock: Schema.encodeUnknownSync(
                          Schema.parseJson(FrontendReplicaBlockSchema),
                        )(replicaBlock),
                      })
                      .where(eq(accountReplicaState.id, 'arps_current'))
                      .run();
                    return state;
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'apply-account-frontend-server-block-failed',
                          message:
                            'Failed to apply account frontend server block',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                }).pipe(Effect.withSpan('applyAccountFrontendServerBlock')),
            }),
          );

          await runtime.runPromise(
            makeTxAsync({
              db: this.partitionStore.db,
              program: ({ tx }) =>
                Effect.tryPromise({
                  try: async () => {
                    for (const command of frontendBlock.pendingPushedCommands) {
                      const journalRow = journalRows.find(
                        row => row.commandId === command.id,
                      );
                      if (journalRow === undefined) continue;
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          command: Schema.encodeUnknownSync(
                            Schema.parseJson(PushedCommandSchema),
                          )(command),
                          lifecycle: 'pushed',
                          pushProvenance: Schema.encodeUnknownSync(
                            Schema.parseJson(PushedCommandSchema),
                          )(command),
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                    }
                    for (const command of frontendBlock.executedPushedCommands) {
                      const journalRow = journalRows.find(
                        row => row.commandId === command.id,
                      );
                      if (journalRow === undefined) continue;
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          command: Schema.encodeUnknownSync(
                            Schema.parseJson(ExecutedPushedCommandSchema),
                          )(command),
                          lifecycle: 'pushed',
                          terminalOutcome: Schema.encodeUnknownSync(
                            Schema.parseJson(ExecutedPushedCommandSchema),
                          )(command),
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                    }
                    for (const command of frontendBlock.failedPushedCommands) {
                      const journalRow = journalRows.find(
                        row => row.commandId === command.id,
                      );
                      if (journalRow === undefined) continue;
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          command: Schema.encodeUnknownSync(
                            Schema.parseJson(FailedPushedCommandSchema),
                          )(command),
                          lifecycle: 'failed',
                          terminalOutcome: Schema.encodeUnknownSync(
                            Schema.parseJson(FailedPushedCommandSchema),
                          )(command),
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRow.id),
                        )
                        .run();
                    }
                    for (const receipt of journalReceipts) {
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          appliedMutations: Schema.encodeUnknownSync(
                            Schema.parseJson(
                              Schema.Array(EncodedAppliedMutationSchema),
                            ),
                          )(receipt.appliedMutations),
                          materializedReplicaIndex: replicaIndex,
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(
                            accountFrontendCommandJournal.id,
                            receipt.journalId,
                          ),
                        )
                        .run();
                    }
                  },
                  catch: ZerospinError.catch({
                    code: 'commit-account-frontend-server-journal-failed',
                    message:
                      'Failed to reconcile account journal after server block',
                  }),
                }).pipe(Effect.withSpan('commitAccountFrontendServerJournal')),
            }),
          );
        }

        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({
            replicaIndex,
            frontendIndex,
            updatedAt: new Date(),
          })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.replicaIndex = replicaIndex;
        this.catalogRow.frontendIndex = frontendIndex;
        await this.fanoutBlock(replicaBlock);
      });
    }

    async pushJournalCommands(): Promise<void> {
      if (
        this.catalogRow.role !== 'active' ||
        this.catalogRow.status !== 'ready' ||
        this.catalogRow.socketState !== 'online' ||
        this.catalogRow.journalHealth !== 'healthy' ||
        this.catalogRow.writeSuspended ||
        this.isTransitionRequired
      ) {
        return;
      }

      const journalRows = await this.partitionStore.db
        .select()
        .from(accountFrontendCommandJournal)
        .where(
          and(
            eq(
              accountFrontendCommandJournal.accountId,
              this.catalogRow.accountId,
            ),
            eq(
              accountFrontendCommandJournal.accountName,
              this.catalogRow.accountName,
            ),
            eq(accountFrontendCommandJournal.actorId, this.catalogRow.actorId),
            eq(
              accountFrontendCommandJournal.actorName,
              this.catalogRow.actorName,
            ),
            eq(
              accountFrontendCommandJournal.frontendName,
              this.catalogRow.frontendName,
            ),
            or(
              and(
                eq(accountFrontendCommandJournal.journalKind, 'source'),
                eq(
                  accountFrontendCommandJournal.sourceGenerationId,
                  generationId,
                ),
                eq(
                  accountFrontendCommandJournal.frontendVersion,
                  this.catalogRow.frontendVersion,
                ),
              ),
              and(
                eq(accountFrontendCommandJournal.journalKind, 'adapted'),
                eq(
                  accountFrontendCommandJournal.targetGenerationId,
                  generationId,
                ),
                eq(
                  accountFrontendCommandJournal.targetFrontendVersion,
                  this.catalogRow.frontendVersion,
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(accountFrontendCommandJournal.stagedCursor))
        .all();
      const pushableRows = journalRows.filter(
        row =>
          row.lifecycle === 'staged' ||
          row.lifecycle === 'pushing' ||
          row.lifecycle === 'transport-uncertain',
      );
      const firstRow = pushableRows[0];
      if (firstRow === undefined) return;
      const firstCommand = Schema.decodeUnknownSync(StagedCommandSchema)(
        Schema.decodeUnknownSync(Schema.parseJson())(firstRow.command),
      );
      const batchRows: typeof pushableRows = [];
      const commands: IEncodedCommand<IStagedCommand>[] = [];
      for (const row of pushableRows) {
        const command = Schema.decodeUnknownSync(StagedCommandSchema)(
          Schema.decodeUnknownSync(Schema.parseJson())(row.command),
        );
        if (command.sessionId !== firstCommand.sessionId) continue;
        batchRows.push(row);
        commands.push(command);
      }
      const batchCommandIds = batchRows.map(row => row.commandId);
      await this.partitionStore.db
        .update(accountFrontendCommandJournal)
        .set({ lifecycle: 'pushing', updatedAt: new Date() })
        .where(
          and(
            eq(
              accountFrontendCommandJournal.accountId,
              this.catalogRow.accountId,
            ),
            eq(
              accountFrontendCommandJournal.accountName,
              this.catalogRow.accountName,
            ),
            eq(accountFrontendCommandJournal.actorId, this.catalogRow.actorId),
            eq(
              accountFrontendCommandJournal.actorName,
              this.catalogRow.actorName,
            ),
            eq(
              accountFrontendCommandJournal.frontendName,
              this.catalogRow.frontendName,
            ),
            or(
              and(
                eq(accountFrontendCommandJournal.journalKind, 'source'),
                eq(
                  accountFrontendCommandJournal.sourceGenerationId,
                  generationId,
                ),
                eq(
                  accountFrontendCommandJournal.frontendVersion,
                  this.catalogRow.frontendVersion,
                ),
              ),
              and(
                eq(accountFrontendCommandJournal.journalKind, 'adapted'),
                eq(
                  accountFrontendCommandJournal.targetGenerationId,
                  generationId,
                ),
                eq(
                  accountFrontendCommandJournal.targetFrontendVersion,
                  this.catalogRow.frontendVersion,
                ),
              ),
            ),
            inArray(accountFrontendCommandJournal.commandId, batchCommandIds),
          ),
        )
        .run();

      const providers = this.providers
        .filter(
          registration =>
            !registration.released && registration.authority === 'online',
        )
        .sort((left, right) => left.registeredAt - right.registeredAt);
      let pushResult:
        | Readonly<{
            pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
            pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
            failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
          }>
        | undefined;
      let lastFailure: unknown;
      for (const registration of providers) {
        try {
          const attemptedPush = await runtime.runPromise(
            decodeRpc(await registration.provider.pushCommands(commands)).pipe(
              Effect.either,
            ),
          );
          if (Either.isLeft(attemptedPush)) {
            throw attemptedPush.left;
          }
          pushResult = attemptedPush.right;
          break;
        } catch (cause) {
          lastFailure = cause;
          if (!ZerospinError.isZerospinError(cause)) {
            registration.released = true;
            if (registration.provider instanceof RpcStub) {
              registration.provider[Symbol.dispose]();
            }
            registration.bufferedBlocks = [];
            continue;
          }
          if (String(cause.code).includes('authentication')) {
            registration.released = true;
            if (registration.provider instanceof RpcStub) {
              registration.provider[Symbol.dispose]();
            }
            registration.bufferedBlocks = [];
            continue;
          }
          if (ZerospinError.isZerospinError(cause)) {
            if (
              cause.code === 'generation-write-admission-closed' ||
              cause.code === 'frontend-generation-changed' ||
              cause.code === 'frontend-version-changed'
            ) {
              await this.partitionStore.db
                .update(accountFrontendCommandJournal)
                .set({ lifecycle: 'dormant', updatedAt: new Date() })
                .where(
                  inArray(
                    accountFrontendCommandJournal.id,
                    batchRows.map(row => row.id),
                  ),
                )
                .run();
              await this.partitionStore.db
                .update(accountFrontendReplicas)
                .set({
                  writeSuspended: true,
                  lastFailure: ZerospinError.stringify(cause),
                  updatedAt: new Date(),
                })
                .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                .run();
              this.catalogRow.writeSuspended = true;
              this.catalogRow.lastFailure = ZerospinError.stringify(cause);
              return;
            }
          }
        }
      }

      if (pushResult === undefined) {
        const failure = ZerospinError.isZerospinError(lastFailure)
          ? lastFailure
          : new ZerospinError({
              code: 'account-frontend-push-transport-uncertain',
              message:
                'No online account provider returned durable push evidence',
              cause: ZerospinError.prettyUnknownFailure(lastFailure),
            });
        await this.partitionStore.db
          .update(accountFrontendCommandJournal)
          .set({ lifecycle: 'transport-uncertain', updatedAt: new Date() })
          .where(
            and(
              eq(
                accountFrontendCommandJournal.accountId,
                this.catalogRow.accountId,
              ),
              eq(
                accountFrontendCommandJournal.accountName,
                this.catalogRow.accountName,
              ),
              eq(
                accountFrontendCommandJournal.actorId,
                this.catalogRow.actorId,
              ),
              eq(
                accountFrontendCommandJournal.actorName,
                this.catalogRow.actorName,
              ),
              eq(
                accountFrontendCommandJournal.frontendName,
                this.catalogRow.frontendName,
              ),
              or(
                and(
                  eq(accountFrontendCommandJournal.journalKind, 'source'),
                  eq(
                    accountFrontendCommandJournal.sourceGenerationId,
                    generationId,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendVersion,
                    this.catalogRow.frontendVersion,
                  ),
                ),
                and(
                  eq(accountFrontendCommandJournal.journalKind, 'adapted'),
                  eq(
                    accountFrontendCommandJournal.targetGenerationId,
                    generationId,
                  ),
                  eq(
                    accountFrontendCommandJournal.targetFrontendVersion,
                    this.catalogRow.frontendVersion,
                  ),
                ),
              ),
              inArray(accountFrontendCommandJournal.commandId, batchCommandIds),
            ),
          )
          .run();
        await this.partitionStore.db
          .update(accountFrontendReplicas)
          .set({
            lastFailure: ZerospinError.stringify(failure),
            updatedAt: new Date(),
          })
          .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.lastFailure = ZerospinError.stringify(failure);
        try {
          await this.repairFromProvider();
        } catch {
          // The byte-identical command stays transport-uncertain for later repair.
        }
        this.socket?.close();
        return;
      }

      const pendingCommands: IEncodedCommand<IPushedCommand>[] = [];
      const pushedCommands: IEncodedCommand<IPushedCommand>[] = [];
      const failedCommands: IEncodedCommand<IFailedStagedCommand>[] = [];
      for (const command of pushResult.pendingCommands) {
        pendingCommands.push(Schema.validateSync(PushedCommandSchema)(command));
      }
      for (const command of pushResult.pushedCommands) {
        pushedCommands.push(Schema.validateSync(PushedCommandSchema)(command));
      }
      for (const command of pushResult.failedCommands) {
        failedCommands.push(
          Schema.validateSync(FailedStagedCommandSchema)(command),
        );
      }

      const responseCommandIds = new Set<
        IEncodedCommand<IStagedCommand>['id']
      >();
      for (const command of [
        ...pendingCommands,
        ...pushedCommands,
        ...failedCommands,
      ]) {
        if (
          command.accountId !== this.catalogRow.accountId ||
          command.accountName !== this.catalogRow.accountName ||
          command.actorId !== this.catalogRow.actorId ||
          command.actorName !== this.catalogRow.actorName ||
          command.frontendName !== this.catalogRow.frontendName ||
          !batchCommandIds.includes(command.id) ||
          responseCommandIds.has(command.id)
        ) {
          throw new ZerospinError({
            code: 'account-frontend-push-result-invalid',
            message:
              'Push evidence contains a foreign, duplicate, or unrequested command',
          });
        }
        responseCommandIds.add(command.id);
      }
      if (responseCommandIds.size !== batchCommandIds.length) {
        throw new ZerospinError({
          code: 'account-frontend-push-result-incomplete',
          message: 'Push evidence does not settle every submitted command ID',
        });
      }

      const current = await this.getSnapshot();
      const replicaIndex = current.replicaIndex + 1;
      const acceptedCommands: IEncodedCommand<IPushedCommand>[] = [];
      for (const command of [...pendingCommands, ...pushedCommands]) {
        if (!acceptedCommands.some(candidate => candidate.id === command.id)) {
          acceptedCommands.push(command);
        }
      }
      const acceptedCommandIds = new Set(
        acceptedCommands.map(command => command.id),
      );
      const failedCommandIds = new Set(
        failedCommands.map(command => command.id),
      );
      const journalReceipts: Array<{
        journalId: (typeof accountFrontendCommandJournal.$inferSelect)['id'];
        appliedMutations: readonly IEncodedAppliedMutation[];
      }> = [];

      const committed = await runtime.runPromise(
        makeTxAsync({
          db: this.db,
          program: ({ tx }) =>
            Effect.tryPromise({
              try: async () => {
                const stagedCommandsToRewind = [...current.stagedCommands].sort(
                  (left, right) =>
                    right.stagedCursor.localeCompare(left.stagedCursor),
                );
                const pushedCommandsToRewind = [...current.pushedCommands]
                  .filter(
                    command =>
                      current.lastRebasedPushedCursor === null ||
                      command.pushedCursor > current.lastRebasedPushedCursor,
                  )
                  .sort((left, right) =>
                    right.pushedCursor.localeCompare(left.pushedCursor),
                  );
                for (const command of [
                  ...stagedCommandsToRewind,
                  ...pushedCommandsToRewind,
                ]) {
                  const optimisticRow = current.optimisticAppliedMutations.find(
                    candidate => candidate.commandId === command.id,
                  );
                  if (optimisticRow !== undefined) {
                    await this.reverseEncodedMutations({
                      tx,
                      mutations: optimisticRow.mutations,
                    });
                  }
                }

                const nextPushedCommands: IEncodedCommand<IPushedCommand>[] =
                  [];
                for (const command of current.pushedCommands) {
                  if (
                    acceptedCommandIds.has(command.id) ||
                    failedCommandIds.has(command.id)
                  ) {
                    continue;
                  }
                  nextPushedCommands.push(command);
                }
                nextPushedCommands.push(...acceptedCommands);
                nextPushedCommands.sort((left, right) =>
                  left.pushedCursor.localeCompare(right.pushedCursor),
                );
                const nextStagedCommands = current.stagedCommands.filter(
                  command => !responseCommandIds.has(command.id),
                );
                const nextFailedStagedCommands = [
                  ...current.failedStagedCommands,
                ];
                for (const command of failedCommands) {
                  if (
                    !nextFailedStagedCommands.some(
                      candidate => candidate.id === command.id,
                    )
                  ) {
                    nextFailedStagedCommands.push(command);
                  }
                }

                const optimisticAppliedMutations: Array<{
                  commandId: IEncodedCommand<IStagedCommand>['id'];
                  mutations: readonly IEncodedAppliedMutation[];
                }> = [];
                for (const command of [
                  ...nextPushedCommands.filter(
                    candidate =>
                      current.lastRebasedPushedCursor === null ||
                      candidate.pushedCursor > current.lastRebasedPushedCursor,
                  ),
                  ...nextStagedCommands.toSorted((left, right) =>
                    left.stagedCursor.localeCompare(right.stagedCursor),
                  ),
                ]) {
                  const journalRow = journalRows.find(
                    candidate => candidate.commandId === command.id,
                  );
                  if (journalRow === undefined) continue;
                  const applied = await this.applyEncodedMutations({
                    tx,
                    commandId: command.id,
                    mutations: Schema.decodeUnknownSync(
                      Schema.parseJson(
                        Schema.Array(EncodedFrontendMutationSchema),
                      ),
                    )(journalRow.mutations),
                    appliedAt: new Date(journalRow.stagedAt),
                  });
                  optimisticAppliedMutations.push({
                    commandId: command.id,
                    mutations: applied.appliedMutations,
                  });
                  journalReceipts.push({
                    journalId: journalRow.id,
                    appliedMutations: applied.appliedMutations,
                  });
                }

                const resources = await this.collectResources(tx);
                const inserted: IEncodedResourceShape[] = [];
                const updated: IEncodedResourceShape[] = [];
                const deleted: Array<{ id: string; modelName: string }> = [];
                for (const resource of resources) {
                  const previous = current.resources.find(
                    candidate =>
                      candidate.id === resource.id &&
                      candidate.modelName === resource.modelName,
                  );
                  if (previous === undefined) {
                    inserted.push(resource);
                  } else if (
                    JSON.stringify(previous) !== JSON.stringify(resource)
                  ) {
                    updated.push(resource);
                  }
                }
                for (const resource of current.resources) {
                  if (
                    !resources.some(
                      candidate =>
                        candidate.id === resource.id &&
                        candidate.modelName === resource.modelName,
                    )
                  ) {
                    deleted.push({
                      id: resource.id,
                      modelName: resource.modelName,
                    });
                  }
                }

                const state: IFrontendReplicaState = {
                  ...current,
                  replicaIndex,
                  resources,
                  pushedCommands: nextPushedCommands,
                  stagedCommands: nextStagedCommands,
                  failedStagedCommands: nextFailedStagedCommands,
                  optimisticAppliedMutations,
                };
                await tx
                  .update(accountReplicaState)
                  .set({
                    state: Schema.encodeUnknownSync(
                      Schema.parseJson(FrontendReplicaStateSchema),
                    )(state),
                  })
                  .where(eq(accountReplicaState.id, 'arps_current'))
                  .run();
                return {
                  state,
                  delta: { inserted, updated, deleted },
                  optimisticAppliedMutations,
                };
              },
              catch: cause =>
                ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'apply-account-frontend-push-result-failed',
                      message: 'Failed to apply durable account push evidence',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    }),
            }).pipe(Effect.withSpan('applyAccountFrontendPushResult')),
        }),
      );

      await runtime.runPromise(
        makeTxAsync({
          db: this.partitionStore.db,
          program: ({ tx }) =>
            Effect.tryPromise({
              try: async () => {
                for (const command of acceptedCommands) {
                  const journalRow = batchRows.find(
                    row => row.commandId === command.id,
                  );
                  if (journalRow === undefined) {
                    throw new ZerospinError({
                      code: 'account-frontend-push-journal-row-missing',
                      message:
                        'Accepted push evidence has no exact submitted journal row',
                    });
                  }
                  await tx
                    .update(accountFrontendCommandJournal)
                    .set({
                      command: Schema.encodeUnknownSync(
                        Schema.parseJson(PushedCommandSchema),
                      )(command),
                      lifecycle: 'pushed',
                      pushProvenance: Schema.encodeUnknownSync(
                        Schema.parseJson(PushedCommandSchema),
                      )(command),
                      updatedAt: new Date(),
                    })
                    .where(eq(accountFrontendCommandJournal.id, journalRow.id))
                    .run();
                }
                for (const command of failedCommands) {
                  const journalRow = batchRows.find(
                    row => row.commandId === command.id,
                  );
                  if (journalRow === undefined) {
                    throw new ZerospinError({
                      code: 'account-frontend-push-journal-row-missing',
                      message:
                        'Failed push evidence has no exact submitted journal row',
                    });
                  }
                  await tx
                    .update(accountFrontendCommandJournal)
                    .set({
                      command: Schema.encodeUnknownSync(
                        Schema.parseJson(FailedStagedCommandSchema),
                      )(command),
                      lifecycle: 'failed',
                      terminalOutcome: Schema.encodeUnknownSync(
                        Schema.parseJson(FailedStagedCommandSchema),
                      )(command),
                      updatedAt: new Date(),
                    })
                    .where(eq(accountFrontendCommandJournal.id, journalRow.id))
                    .run();
                }
                for (const receipt of journalReceipts) {
                  await tx
                    .update(accountFrontendCommandJournal)
                    .set({
                      appliedMutations: Schema.encodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAppliedMutationSchema),
                        ),
                      )(receipt.appliedMutations),
                      materializedReplicaIndex: replicaIndex,
                      updatedAt: new Date(),
                    })
                    .where(
                      eq(accountFrontendCommandJournal.id, receipt.journalId),
                    )
                    .run();
                }
                await tx
                  .update(accountFrontendReplicas)
                  .set({
                    replicaIndex,
                    lastFailure: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                  .run();
              },
              catch: ZerospinError.catch({
                code: 'commit-account-frontend-push-result-failed',
                message: 'Failed to commit account journal push evidence',
              }),
            }).pipe(Effect.withSpan('commitAccountFrontendPushResult')),
        }),
      );
      this.catalogRow.replicaIndex = replicaIndex;
      this.catalogRow.lastFailure = null;

      const block: IFrontendReplicaBlock = {
        kind: 'local-command',
        systemId: current.systemId,
        generationId: current.generationId,
        accountId: current.accountId,
        accountName: current.accountName,
        actorId: current.actorId,
        actorName: current.actorName,
        frontendName: current.frontendName,
        frontendVersion: current.frontendVersion,
        replicaIndex,
        frontendIndex: current.frontendIndex,
        delta: committed.delta,
        stagedCommandsAdded: [],
        stagedCommandIdsRemoved: [...responseCommandIds],
        pushedCommandsAdded: acceptedCommands,
        pushedCommandIdsRemoved: [],
        executedPushedCommandsAdded: [],
        executedPushedCommandIdsRemoved: [],
        failedStagedCommandsAdded: failedCommands,
        failedPushedCommandsAdded: [],
        failedCommandIdsRemoved: [],
        optimisticAppliedMutationsAdded: committed.optimisticAppliedMutations,
        optimisticAppliedMutationCommandIdsRemoved:
          current.optimisticAppliedMutations.map(row => row.commandId),
      };
      await this.fanoutBlock(block);
      setTimeout(() => {
        void this.serialize(() => this.pushJournalCommands());
      }, 0);
    }

    async stage(props: {
      ownerToken: object;
      baseReplicaIndex: number;
      command: IEncodedCommand<IStagedCommand>;
      mutations: readonly IEncodedFrontendMutation[];
    }): Promise<{ commandId: string; replicaIndex: number }> {
      return this.serialize(async () => {
        const activeRegistration = this.providers.find(
          registration =>
            registration.ownerToken === props.ownerToken &&
            !registration.released &&
            registration.role === 'active',
        );
        if (activeRegistration === undefined) {
          throw new ZerospinError({
            code: 'account-frontend-stage-owner-not-active',
            message:
              'The staging caller has no active account replica registration',
          });
        }
        if (this.catalogRow.status !== 'ready') {
          throw new ZerospinError({
            code: 'account-frontend-stage-replica-not-ready',
            message: 'Only a ready account replica can stage commands',
          });
        }
        if (this.catalogRow.role !== 'active') {
          throw new ZerospinError({
            code: 'commissioned-account-frontend-replica-read-only',
            message:
              'A commissioned account frontend replica cannot stage commands',
          });
        }
        if (this.catalogRow.journalHealth !== 'healthy') {
          throw new ZerospinError({
            code: 'account-frontend-stage-journal-unhealthy',
            message: 'An unhealthy account journal cannot accept commands',
          });
        }
        if (
          this.isTransitionRequired ||
          this.catalogRow.pendingTransition !== null ||
          this.catalogRow.writeSuspended
        ) {
          throw new ZerospinError({
            code: 'account-frontend-stage-write-suspended',
            message:
              'The account replica cannot stage commands while writes are suspended',
          });
        }
        const current = await this.getSnapshot();
        if (props.baseReplicaIndex !== current.replicaIndex) {
          throw new ZerospinError({
            code: 'account-frontend-replica-base-index-stale',
            message: 'The command was prepared against a stale replica index',
            extra: {
              expectedReplicaIndex: current.replicaIndex,
              receivedReplicaIndex: props.baseReplicaIndex,
            },
          });
        }

        const command = Schema.validateSync(StagedCommandSchema)(props.command);
        if (
          command.accountId !== this.catalogRow.accountId ||
          command.accountName !== this.catalogRow.accountName ||
          command.actorId !== this.catalogRow.actorId ||
          command.actorName !== this.catalogRow.actorName ||
          command.frontendName !== this.catalogRow.frontendName
        ) {
          throw new ZerospinError({
            code: 'account-frontend-journal-command-target-mismatch',
            message:
              'Staged command does not match the acquired account target',
          });
        }

        const existingRows = await this.partitionStore.db
          .select()
          .from(accountFrontendCommandJournal)
          .where(
            and(
              eq(
                accountFrontendCommandJournal.sourceGenerationId,
                generationId,
              ),
              eq(
                accountFrontendCommandJournal.accountId,
                this.catalogRow.accountId,
              ),
              eq(
                accountFrontendCommandJournal.accountName,
                this.catalogRow.accountName,
              ),
              eq(
                accountFrontendCommandJournal.actorId,
                this.catalogRow.actorId,
              ),
              eq(
                accountFrontendCommandJournal.actorName,
                this.catalogRow.actorName,
              ),
              eq(
                accountFrontendCommandJournal.frontendName,
                this.catalogRow.frontendName,
              ),
              eq(
                accountFrontendCommandJournal.frontendVersion,
                this.catalogRow.frontendVersion,
              ),
              eq(accountFrontendCommandJournal.journalKind, 'source'),
              eq(accountFrontendCommandJournal.commandId, command.id),
            ),
          )
          .all();
        const existing = existingRows[0];
        const journalRowId =
          existing?.id ??
          (await runtime.runPromise(
            makeIdFromAbbreviation({ abbreviation: 'afcj' }),
          ));
        if (existing !== undefined) {
          if (
            existing.command !==
              Schema.encodeUnknownSync(Schema.parseJson(StagedCommandSchema))(
                command,
              ) ||
            existing.mutations !==
              Schema.encodeUnknownSync(
                Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
              )(props.mutations)
          ) {
            throw new ZerospinError({
              code: 'account-frontend-journal-command-conflict',
              message: 'The command ID already exists with different bytes',
            });
          }
          if (existing.materializedReplicaIndex !== null) {
            return {
              commandId: command.id,
              replicaIndex: existing.materializedReplicaIndex,
            };
          }

          const materializedCommand = current.stagedCommands.find(
            candidate => candidate.id === command.id,
          );
          if (materializedCommand !== undefined) {
            const optimisticReceipt = current.optimisticAppliedMutations.find(
              candidate => candidate.commandId === command.id,
            );
            if (optimisticReceipt === undefined) {
              throw new ZerospinError({
                code: 'account-frontend-journal-materialization-receipt-missing',
                message:
                  'Materialized staged command has no optimistic mutation receipt',
                extra: { commandId: command.id },
              });
            }

            await runtime.runPromise(
              makeTxAsync({
                db: this.partitionStore.db,
                program: ({ tx }) =>
                  Effect.tryPromise({
                    try: async () => {
                      await tx
                        .update(accountFrontendCommandJournal)
                        .set({
                          appliedMutations: Schema.encodeUnknownSync(
                            Schema.parseJson(
                              Schema.Array(EncodedAppliedMutationSchema),
                            ),
                          )(optimisticReceipt.mutations),
                          materializedReplicaIndex: current.replicaIndex,
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendCommandJournal.id, journalRowId),
                        )
                        .run();
                      await tx
                        .update(accountFrontendReplicas)
                        .set({
                          replicaIndex: current.replicaIndex,
                          updatedAt: new Date(),
                        })
                        .where(
                          eq(accountFrontendReplicas.id, this.catalogRow.id),
                        )
                        .run();
                    },
                    catch: ZerospinError.catch({
                      code: 'recover-staged-frontend-command-receipt-failed',
                      message:
                        'Failed to recover the staged command materialization receipt',
                    }),
                  }).pipe(
                    Effect.withSpan('recoverStagedFrontendCommandReceipt'),
                  ),
              }),
            );
            this.catalogRow.replicaIndex = current.replicaIndex;
            await this.fanoutReplacement(current);
            return {
              commandId: command.id,
              replicaIndex: current.replicaIndex,
            };
          }
        } else {
          await this.partitionStore.db
            .insert(accountFrontendCommandJournal)
            .values({
              id: journalRowId,
              commandId: command.id,
              sourceGenerationId: generationId,
              accountId: this.catalogRow.accountId,
              accountName: this.catalogRow.accountName,
              actorId: this.catalogRow.actorId,
              actorName: this.catalogRow.actorName,
              frontendName: this.catalogRow.frontendName,
              frontendVersion: this.catalogRow.frontendVersion,
              journalKind: 'source',
              command: Schema.encodeUnknownSync(
                Schema.parseJson(StagedCommandSchema),
              )(command),
              sourceCommand: null,
              mutations: Schema.encodeUnknownSync(
                Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
              )(props.mutations),
              appliedMutations: Schema.encodeUnknownSync(
                Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
              )([]),
              stagedCursor: command.stagedCursor,
              stagedAt: command.stagedAt.getTime(),
              originalContractVersion: command.version,
              originalPayload: command.payload,
              lifecycle: 'staged',
              pushProvenance: null,
              terminalOutcome: null,
              targetGenerationId: null,
              targetFrontendVersion: null,
              materializedReplicaIndex: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();
        }

        const replicaIndex = current.replicaIndex + 1;
        let committedDelta: IFrontendDelta = {
          inserted: [],
          updated: [],
          deleted: [],
        };
        let committedMutations: readonly IEncodedAppliedMutation[] = [];
        await runtime.runPromise(
          makeTxAsync({
            db: this.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  const applied = await this.applyEncodedMutations({
                    tx,
                    commandId: command.id,
                    mutations: props.mutations,
                    appliedAt: command.stagedAt,
                  });
                  committedDelta = applied.delta;
                  committedMutations = applied.appliedMutations;
                  const state: IFrontendReplicaState = {
                    ...current,
                    replicaIndex,
                    resources: await this.collectResources(tx),
                    stagedCommands: [...current.stagedCommands, command],
                    optimisticAppliedMutations: [
                      ...current.optimisticAppliedMutations,
                      {
                        commandId: command.id,
                        mutations: applied.appliedMutations,
                      },
                    ],
                  };
                  await tx
                    .update(accountReplicaState)
                    .set({
                      state: Schema.encodeUnknownSync(
                        Schema.parseJson(FrontendReplicaStateSchema),
                      )(state),
                    })
                    .where(eq(accountReplicaState.id, 'arps_current'))
                    .run();
                  return state;
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'materialize-staged-frontend-command-failed',
                        message: 'Failed to materialize durable staged command',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                        extra: { commandId: command.id },
                      }),
              }).pipe(Effect.withSpan('materializeStagedFrontendCommand')),
          }),
        );

        await runtime.runPromise(
          makeTxAsync({
            db: this.partitionStore.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  await tx
                    .update(accountFrontendCommandJournal)
                    .set({
                      appliedMutations: Schema.encodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAppliedMutationSchema),
                        ),
                      )(committedMutations),
                      materializedReplicaIndex: replicaIndex,
                      updatedAt: new Date(),
                    })
                    .where(eq(accountFrontendCommandJournal.id, journalRowId))
                    .run();
                  await tx
                    .update(accountFrontendReplicas)
                    .set({ replicaIndex, updatedAt: new Date() })
                    .where(eq(accountFrontendReplicas.id, this.catalogRow.id))
                    .run();
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'commit-staged-frontend-command-failed',
                        message:
                          'Failed to commit staged command materialization receipt',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                        extra: { commandId: command.id },
                      }),
              }).pipe(Effect.withSpan('commitStagedFrontendCommand')),
          }),
        );

        this.catalogRow.replicaIndex = replicaIndex;
        const block: IFrontendReplicaBlock = {
          kind: 'local-command',
          systemId: current.systemId,
          generationId: current.generationId,
          accountId: current.accountId,
          accountName: current.accountName,
          actorId: current.actorId,
          actorName: current.actorName,
          frontendName: current.frontendName,
          frontendVersion: current.frontendVersion,
          replicaIndex,
          frontendIndex: current.frontendIndex,
          delta: committedDelta,
          stagedCommandsAdded: [command],
          stagedCommandIdsRemoved: [],
          pushedCommandsAdded: [],
          pushedCommandIdsRemoved: [],
          executedPushedCommandsAdded: [],
          executedPushedCommandIdsRemoved: [],
          failedStagedCommandsAdded: [],
          failedPushedCommandsAdded: [],
          failedCommandIdsRemoved: [],
          optimisticAppliedMutationsAdded: [
            { commandId: command.id, mutations: committedMutations },
          ],
          optimisticAppliedMutationCommandIdsRemoved: [],
        };
        await this.fanoutBlock(block);
        if (this.catalogRow.socketState === 'online') {
          setTimeout(() => {
            void this.serialize(() => this.pushJournalCommands());
          }, 0);
        }
        return { commandId: command.id, replicaIndex };
      });
    }

    activeProviderCount(): number {
      return this.providers.filter(registration => !registration.released)
        .length;
    }
  }

  class ServiceReplicaRuntime {
    private queueTail: Promise<void> = Promise.resolve();
    private socket: WebSocket | null = null;
    private reconnectFiber: Fiber.RuntimeFiber<void, IAnyError> | null = null;
    private isTransitionRequired = false;
    private isFrontendVersionUpdateRequired = false;
    private providers: Array<{
      id: string;
      provider:
        | ServiceFrontendReplicaProviderApi
        | RpcStub<ServiceFrontendReplicaProviderApi>;
      authority: 'online' | 'cached-offline';
      role: 'active' | 'commissioned';
      registeredAt: number;
      ownerToken: object;
      gateOpen: boolean;
      stateRequested: boolean;
      capturedSnapshot: IServiceFrontendReplicaState;
      bufferedBlocks: IServiceFrontendReplicaBlock[];
      released: boolean;
    }> = [];

    constructor(
      readonly catalogRow: typeof serviceFrontendReplicas.$inferSelect,
      readonly partitionStore: {
        partitionKey: string;
        partitionSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
        db: IAsyncWaSqliteDrizzleDb<typeof partitionDbConfig>;
        systemId: string;
        generationId: string;
        vfsName: string;
        acquisitionTail: Promise<void>;
      },
      public db: IAsyncWaSqliteDrizzleDb,
      readonly resourceSchemas: IAnyDrizzleSchemas,
    ) {
      this.isTransitionRequired = catalogRow.pendingTransition !== null;
    }

    serialize<SUCCESS>(program: () => Promise<SUCCESS>): Promise<SUCCESS> {
      const result = this.queueTail.then(program);
      this.queueTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }

    async getSnapshot(): Promise<IServiceFrontendReplicaState> {
      const row = await this.db
        .select()
        .from(serviceReplicaState)
        .where(eq(serviceReplicaState.id, 'srps_current'))
        .get();
      if (row === undefined) {
        throw new ZerospinError({
          code: 'service-frontend-replica-state-missing',
          message: 'Service frontend replica has no committed state',
        });
      }
      return Schema.decodeUnknownSync(
        Schema.parseJson(ServiceFrontendReplicaStateSchema),
      )(row.state);
    }

    async replaceFromServer(
      frontendState: IServiceFrontendState,
    ): Promise<IServiceFrontendReplicaState> {
      if (
        frontendState.systemId !== this.partitionStore.systemId ||
        frontendState.generationId !== this.partitionStore.generationId ||
        frontendState.serviceName !== this.catalogRow.serviceName ||
        frontendState.actorId !== this.catalogRow.actorId ||
        frontendState.actorName !== this.catalogRow.actorName ||
        frontendState.frontendName !== this.catalogRow.frontendName
      ) {
        throw new ZerospinError({
          code: 'service-frontend-replica-state-target-mismatch',
          message:
            'Authoritative service frontend state targets another replica',
        });
      }

      try {
        const currentRow = await this.db
          .select()
          .from(serviceReplicaState)
          .where(eq(serviceReplicaState.id, 'srps_current'))
          .get();
        const currentState =
          currentRow === undefined
            ? undefined
            : Schema.decodeUnknownSync(
                Schema.parseJson(ServiceFrontendReplicaStateSchema),
              )(currentRow.state);
        const replicaIndex = (currentState?.replicaIndex ?? 0) + 1;
        const state: IServiceFrontendReplicaState = {
          ...frontendState,
          frontendVersion: this.catalogRow.frontendVersion,
          replicaIndex,
        };

        await runtime.runPromise(
          makeTxAsync({
            db: this.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
                  for (const resourceSchema of Object.values(
                    this.resourceSchemas,
                  ).reverse()) {
                    await tx.delete(resourceSchema).run();
                  }
                  for (const resource of frontendState.resources) {
                    const resourceSchema =
                      this.resourceSchemas[resource.modelName];
                    if (resourceSchema === undefined) {
                      throw new ZerospinError({
                        code: 'service-frontend-replica-resource-model-missing',
                        message: `State resource model "${resource.modelName}" is not in the acquired service spec`,
                      });
                    }
                    await tx.insert(resourceSchema).values(resource).run();
                  }
                  await tx
                    .insert(serviceReplicaState)
                    .values({
                      id: 'srps_current',
                      state: Schema.encodeUnknownSync(
                        Schema.parseJson(ServiceFrontendReplicaStateSchema),
                      )(state),
                      previousBlock: null,
                    })
                    .onConflictDoUpdate({
                      target: serviceReplicaState.id,
                      set: {
                        state: Schema.encodeUnknownSync(
                          Schema.parseJson(ServiceFrontendReplicaStateSchema),
                        )(state),
                        previousBlock: null,
                      },
                    })
                    .run();
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'replace-service-frontend-replica-failed',
                        message:
                          'Failed to transactionally replace service frontend replica',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              }).pipe(Effect.withSpan('replaceServiceReplicaFromServer')),
          }),
        );
        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({
            status: 'ready',
            replicaIndex,
            frontendIndex: frontendState.frontendIndex,
            systemVersion: frontendState.systemVersion,
            systemWorkerName: frontendState.systemWorkerName,
            lastFailure: null,
            updatedAt: new Date(),
          })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.status = 'ready';
        this.catalogRow.replicaIndex = replicaIndex;
        this.catalogRow.frontendIndex = frontendState.frontendIndex;
        this.catalogRow.systemVersion = frontendState.systemVersion;
        this.catalogRow.systemWorkerName = frontendState.systemWorkerName;
        this.catalogRow.lastFailure = null;
        return state;
      } catch (physicalCause) {
        if (this.catalogRow.status !== 'ready') {
          throw physicalCause;
        }

        const oldDatabaseName = this.catalogRow.databaseName;
        const previousDatabaseNames = Schema.decodeUnknownSync(
          Schema.parseJson(Schema.Array(Schema.String)),
        )(this.catalogRow.previousDatabaseNames);
        const rebuiltDatabaseId = await runtime.runPromise(
          makeIdFromAbbreviation({ abbreviation: 'sfrp' }),
        );
        const rebuiltDatabaseName = `${rebuiltDatabaseId}.db`;
        const rebuiltReplicaSqlite = await makeIdbSQLite3({
          databaseName: rebuiltDatabaseName,
          vfsName: `${this.partitionStore.vfsName}/service/${this.catalogRow.id}`,
          wasmUrl: sharedWorkerWasmUrl,
        });
        const completeReplicaDbConfig = {
          schema: {
            ...this.resourceSchemas,
            ...serviceReplicaDbConfig.schema,
          },
          relations: serviceReplicaDbConfig.relations,
        };
        const rebuiltDb = makeAsyncWaSqliteDrizzle(
          rebuiltReplicaSqlite,
          completeReplicaDbConfig,
        );

        try {
          await runtime.runPromise(
            migrateDbAsync({
              db: rebuiltDb,
              schema: completeReplicaDbConfig.schema,
            }),
          );

          const replicaIndex = this.catalogRow.replicaIndex + 1;
          const state: IServiceFrontendReplicaState = {
            ...frontendState,
            frontendVersion: this.catalogRow.frontendVersion,
            replicaIndex,
          };
          await runtime.runPromise(
            makeTxAsync({
              db: rebuiltDb,
              program: ({ tx }) =>
                Effect.tryPromise({
                  try: async () => {
                    await tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
                    for (const resource of frontendState.resources) {
                      const resourceSchema =
                        this.resourceSchemas[resource.modelName];
                      if (resourceSchema === undefined) {
                        throw new ZerospinError({
                          code: 'service-frontend-replica-resource-model-missing',
                          message: `State resource model "${resource.modelName}" is not in the acquired service spec`,
                        });
                      }
                      await tx.insert(resourceSchema).values(resource).run();
                    }
                    await tx
                      .insert(serviceReplicaState)
                      .values({
                        id: 'srps_current',
                        state: Schema.encodeUnknownSync(
                          Schema.parseJson(ServiceFrontendReplicaStateSchema),
                        )(state),
                        previousBlock: null,
                      })
                      .run();
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'rebuild-service-frontend-replica-failed',
                          message:
                            'Failed to transactionally rebuild service frontend replica',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                }).pipe(Effect.withSpan('rebuildServiceReplicaFromServer')),
            }),
          );

          const encodedPreviousDatabaseNames = Schema.encodeUnknownSync(
            Schema.parseJson(Schema.Array(Schema.String)),
          )([...previousDatabaseNames, oldDatabaseName]);
          await runtime.runPromise(
            makeTxAsync({
              db: this.partitionStore.db,
              program: ({ tx }) =>
                Effect.tryPromise({
                  try: async () => {
                    await tx
                      .update(serviceFrontendReplicas)
                      .set({
                        databaseName: rebuiltDatabaseName,
                        previousDatabaseNames: encodedPreviousDatabaseNames,
                        status: 'ready',
                        replicaIndex,
                        frontendIndex: frontendState.frontendIndex,
                        systemVersion: frontendState.systemVersion,
                        systemWorkerName: frontendState.systemWorkerName,
                        lastFailure: null,
                        updatedAt: new Date(),
                      })
                      .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
                      .run();
                  },
                  catch: cause =>
                    ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'commit-service-frontend-replica-repoint-failed',
                          message:
                            'Failed to atomically repoint rebuilt service frontend replica',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        }),
                }).pipe(Effect.withSpan('commitServiceReplicaRepoint')),
            }),
          );

          this.db = rebuiltDb;
          this.catalogRow.databaseName = rebuiltDatabaseName;
          this.catalogRow.previousDatabaseNames = encodedPreviousDatabaseNames;
          this.catalogRow.status = 'ready';
          this.catalogRow.replicaIndex = replicaIndex;
          this.catalogRow.frontendIndex = frontendState.frontendIndex;
          this.catalogRow.systemVersion = frontendState.systemVersion;
          this.catalogRow.systemWorkerName = frontendState.systemWorkerName;
          this.catalogRow.lastFailure = null;
          return state;
        } catch (cause) {
          const failure = ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'rebuild-service-frontend-replica-failed',
                message:
                  'Failed to rebuild service frontend replica while preserving the prior database',
                cause: ZerospinError.prettyUnknownFailure(cause),
              });
          await this.partitionStore.db
            .update(serviceFrontendReplicas)
            .set({
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          throw failure;
        }
      }
    }

    async acquire(props: {
      provider: ServiceFrontendReplicaProviderApi;
      authority: 'online' | 'cached-offline';
      role: 'active' | 'commissioned';
      ownerToken: object;
    }): Promise<string> {
      const existing = this.providers.find(
        registration =>
          registration.ownerToken === props.ownerToken &&
          !registration.released,
      );
      if (existing !== undefined) {
        if (props.authority === 'online') existing.authority = 'online';
        if (props.role === 'active') existing.role = 'active';
        if (
          props.role === 'active' &&
          this.catalogRow.role === 'commissioned'
        ) {
          await this.partitionStore.db
            .update(serviceFrontendReplicas)
            .set({ role: 'active', updatedAt: new Date() })
            .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.role = 'active';
        }
        if (props.authority === 'online') {
          setTimeout(() => {
            void this.connectSocket();
          }, 0);
        }
        return existing.id;
      }
      nextRegistrationId += 1;
      const registrationId = `service-provider-${nextRegistrationId}`;
      if (props.role === 'active' && this.catalogRow.role === 'commissioned') {
        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({ role: 'active', updatedAt: new Date() })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.role = 'active';
      }
      const retainedProvider =
        props.provider instanceof RpcStub
          ? props.provider.dup()
          : props.provider;
      this.providers.push({
        id: registrationId,
        provider: retainedProvider,
        authority: props.authority,
        role: props.role,
        registeredAt: Date.now(),
        ownerToken: props.ownerToken,
        gateOpen: false,
        stateRequested: false,
        capturedSnapshot: await this.getSnapshot(),
        bufferedBlocks: [],
        released: false,
      });
      if (props.authority === 'online') {
        setTimeout(() => {
          void this.connectSocket();
        }, 0);
      }
      return registrationId;
    }

    async getAcquiredState(
      registrationId: string,
    ): Promise<IServiceFrontendReplicaState> {
      return this.serialize(async () => {
        const registration = this.providers.find(
          candidate => candidate.id === registrationId && !candidate.released,
        );
        if (registration === undefined) {
          throw new ZerospinError({
            code: 'service-frontend-replica-acquisition-released',
            message: 'Service frontend replica acquisition is released',
          });
        }
        if (registration.stateRequested) return this.getSnapshot();
        registration.stateRequested = true;
        const capturedSnapshot = registration.capturedSnapshot;
        setTimeout(() => {
          void this.serialize(async () => {
            if (registration.released) return;
            registration.gateOpen = true;
            const bufferedBlocks = registration.bufferedBlocks;
            registration.bufferedBlocks = [];
            for (const block of bufferedBlocks) {
              try {
                await runtime.runPromise(
                  decodeRpc(
                    await registration.provider.handleServiceFrontendReplicaBlock(
                      block,
                    ),
                  ),
                );
              } catch {
                try {
                  await runtime.runPromise(
                    decodeRpc(
                      await registration.provider.replaceFrontendState(
                        await this.getSnapshot(),
                      ),
                    ),
                  );
                } catch {
                  registration.released = true;
                  if (registration.provider instanceof RpcStub) {
                    registration.provider[Symbol.dispose]();
                  }
                  registration.bufferedBlocks = [];
                  break;
                }
              }
            }
            if (this.providers.every(candidate => candidate.released)) {
              this.socket?.close();
              this.socket = null;
              if (this.reconnectFiber !== null) {
                runtime.runFork(Fiber.interrupt(this.reconnectFiber));
                this.reconnectFiber = null;
              }
              await this.partitionStore.db
                .update(serviceFrontendReplicas)
                .set({ socketState: 'disconnected', updatedAt: new Date() })
                .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
                .run();
              this.catalogRow.socketState = 'disconnected';
            }
          });
        }, 0);
        return capturedSnapshot;
      });
    }

    async fanoutBlock(block: IServiceFrontendReplicaBlock): Promise<void> {
      for (const registration of this.providers) {
        if (registration.released) continue;
        if (!registration.gateOpen) {
          registration.bufferedBlocks.push(block);
          continue;
        }
        try {
          await runtime.runPromise(
            decodeRpc(
              await registration.provider.handleServiceFrontendReplicaBlock(
                block,
              ),
            ),
          );
        } catch {
          try {
            await runtime.runPromise(
              decodeRpc(
                await registration.provider.replaceFrontendState(
                  await this.getSnapshot(),
                ),
              ),
            );
          } catch {
            registration.released = true;
            if (registration.provider instanceof RpcStub) {
              registration.provider[Symbol.dispose]();
            }
            registration.bufferedBlocks = [];
          }
        }
      }
      if (this.providers.every(candidate => candidate.released)) {
        this.socket?.close();
        this.socket = null;
        if (this.reconnectFiber !== null) {
          runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({ socketState: 'disconnected', updatedAt: new Date() })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'disconnected';
      }
    }

    async fanoutReplacement(
      state: IServiceFrontendReplicaState,
    ): Promise<void> {
      for (const registration of this.providers) {
        if (registration.released || !registration.gateOpen) continue;
        try {
          await runtime.runPromise(
            decodeRpc(await registration.provider.replaceFrontendState(state)),
          );
        } catch {
          registration.released = true;
          if (registration.provider instanceof RpcStub) {
            registration.provider[Symbol.dispose]();
          }
          registration.bufferedBlocks = [];
        }
      }
      if (this.providers.every(candidate => candidate.released)) {
        this.socket?.close();
        this.socket = null;
        if (this.reconnectFiber !== null) {
          runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({ socketState: 'disconnected', updatedAt: new Date() })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'disconnected';
      }
    }

    async repairFromProvider(): Promise<void> {
      const providers = this.providers
        .filter(
          registration =>
            !registration.released && registration.authority === 'online',
        )
        .sort((left, right) => left.registeredAt - right.registeredAt);
      let lastFailure: unknown;
      for (const registration of providers) {
        try {
          const frontendStateOutcome = await runtime.runPromise(
            decodeRpc(await registration.provider.getFrontendState()).pipe(
              Effect.either,
            ),
          );
          if (Either.isLeft(frontendStateOutcome)) {
            throw frontendStateOutcome.left;
          }
          const frontendState = frontendStateOutcome.right;
          const replacement = await this.replaceFromServer(frontendState);
          await this.fanoutReplacement(replacement);
          return;
        } catch (cause) {
          lastFailure = cause;
          if (
            ZerospinError.isZerospinError(cause) &&
            cause.code === 'frontend-version-changed'
          ) {
            const encodedVersionFailure = ZerospinError.stringify(cause);
            await this.partitionStore.db
              .update(serviceFrontendReplicas)
              .set({
                lastFailure: encodedVersionFailure,
                updatedAt: new Date(),
              })
              .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
              .run();
            this.isFrontendVersionUpdateRequired = true;
            this.catalogRow.lastFailure = encodedVersionFailure;
          }
          if (
            !ZerospinError.isZerospinError(cause) ||
            String(cause.code).includes('authentication')
          ) {
            registration.released = true;
            if (registration.provider instanceof RpcStub) {
              registration.provider[Symbol.dispose]();
            }
            registration.bufferedBlocks = [];
          }
        }
      }
      if (this.providers.every(candidate => candidate.released)) {
        this.socket?.close();
        this.socket = null;
        if (this.reconnectFiber !== null) {
          runtime.runFork(Fiber.interrupt(this.reconnectFiber));
          this.reconnectFiber = null;
        }
        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({ socketState: 'disconnected', updatedAt: new Date() })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'disconnected';
      }
      throw ZerospinError.isZerospinError(lastFailure)
        ? lastFailure
        : new ZerospinError({
            code: 'service-frontend-replica-repair-failed',
            message: 'No online service provider could repair the replica',
            cause: ZerospinError.prettyUnknownFailure(lastFailure),
          });
    }

    async scheduleReconnect(): Promise<void> {
      if (
        this.reconnectFiber !== null ||
        this.isTransitionRequired ||
        !this.providers.some(
          registration =>
            !registration.released && registration.authority === 'online',
        )
      ) {
        return;
      }
      const reconnectAttempt = this.catalogRow.reconnectAttempt + 1;
      const delay = Math.min(
        30_000,
        250 * 2 ** this.catalogRow.reconnectAttempt,
      );
      await this.partitionStore.db
        .update(serviceFrontendReplicas)
        .set({
          socketState: 'disconnected',
          reconnectAttempt,
          updatedAt: new Date(),
        })
        .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
        .run();
      this.catalogRow.socketState = 'disconnected';
      this.catalogRow.reconnectAttempt = reconnectAttempt;
      this.reconnectFiber = runtime.runFork(
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

    async connectSocket(): Promise<void> {
      await this.serialize(async () => {
        if (
          this.socket !== null ||
          this.isTransitionRequired ||
          !this.providers.some(
            registration =>
              !registration.released && registration.authority === 'online',
          )
        ) {
          return;
        }

        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({ socketState: 'connecting', updatedAt: new Date() })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.socketState = 'connecting';

        const providers = this.providers
          .filter(
            registration =>
              !registration.released && registration.authority === 'online',
          )
          .sort((left, right) => left.registeredAt - right.registeredAt);
        let selectedTicket:
          | Readonly<{
              ticket: string;
              systemId: ISystemId;
              generationId: string;
              serviceName: string;
              actorId: IActorId;
              actorName: string;
              frontendName: string;
              frontendVersion: string;
            }>
          | undefined;
        let selectedRegistration: (typeof this.providers)[number] | undefined;
        let lastFailure: unknown;
        for (const registration of providers) {
          try {
            const ticketOutcome = await runtime.runPromise(
              decodeRpc(
                await registration.provider.createFrontendWebSocketTicket(),
              ).pipe(Effect.either),
            );
            if (Either.isLeft(ticketOutcome)) {
              throw ticketOutcome.left;
            }
            const ticket = ticketOutcome.right;
            if (
              ticket.systemId !== systemId ||
              ticket.serviceName !== this.catalogRow.serviceName ||
              ticket.actorId !== this.catalogRow.actorId ||
              ticket.actorName !== this.catalogRow.actorName ||
              ticket.frontendName !== this.catalogRow.frontendName
            ) {
              registration.released = true;
              if (registration.provider instanceof RpcStub) {
                registration.provider[Symbol.dispose]();
              }
              registration.bufferedBlocks = [];
              lastFailure = new ZerospinError({
                code: 'service-frontend-websocket-ticket-target-mismatch',
                message:
                  'Fresh service frontend WebSocket ticket targets another actor or frontend',
              });
              continue;
            }
            if (
              ticket.generationId === generationId &&
              ticket.frontendVersion !== this.catalogRow.frontendVersion
            ) {
              const versionFailure = new ZerospinError({
                code: 'frontend-version-changed',
                message:
                  'Authoritative service frontend version changed within the current generation',
                extra: {
                  generationId,
                  sourceFrontendVersion: this.catalogRow.frontendVersion,
                  targetFrontendVersion: ticket.frontendVersion,
                },
              });
              const encodedVersionFailure =
                ZerospinError.stringify(versionFailure);
              await this.partitionStore.db
                .update(serviceFrontendReplicas)
                .set({
                  lastFailure: encodedVersionFailure,
                  updatedAt: new Date(),
                })
                .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
                .run();
              this.isFrontendVersionUpdateRequired = true;
              this.catalogRow.lastFailure = encodedVersionFailure;
            }
            selectedTicket = ticket;
            selectedRegistration = registration;
            break;
          } catch (cause) {
            lastFailure = cause;
            if (
              !ZerospinError.isZerospinError(cause) ||
              String(cause.code).includes('authentication')
            ) {
              registration.released = true;
              if (registration.provider instanceof RpcStub) {
                registration.provider[Symbol.dispose]();
              }
              registration.bufferedBlocks = [];
            }
          }
        }
        if (
          selectedTicket === undefined ||
          selectedRegistration === undefined
        ) {
          const failure = ZerospinError.isZerospinError(lastFailure)
            ? lastFailure
            : new ZerospinError({
                code: 'service-frontend-websocket-ticket-failed',
                message:
                  'No online service provider could mint a WebSocket ticket',
                cause: ZerospinError.prettyUnknownFailure(lastFailure),
              });
          await this.partitionStore.db
            .update(serviceFrontendReplicas)
            .set({
              socketState: 'disconnected',
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.socketState = 'disconnected';
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          await this.scheduleReconnect();
          return;
        }

        const socketUrl = new URL(sharedWorkerApiUrl);
        if (socketUrl.protocol === 'https:') {
          socketUrl.protocol = 'wss:';
        } else if (socketUrl.protocol === 'http:') {
          socketUrl.protocol = 'ws:';
        } else {
          throw new ZerospinError({
            code: 'service-frontend-websocket-url-invalid',
            message: 'SharedWorker API URL must use http or https',
          });
        }
        socketUrl.pathname = '/ws-service-frontend-blocks';
        socketUrl.search = '';
        socketUrl.searchParams.set(
          'publishableKey',
          sharedWorkerPublishableKey,
        );
        socketUrl.searchParams.set('ticket', selectedTicket.ticket);

        let socket: WebSocket;
        try {
          socket = new WebSocket(socketUrl.toString());
        } catch (cause) {
          const failure = new ZerospinError({
            code: 'service-frontend-websocket-construction-failed',
            message: 'Failed to construct service frontend WebSocket',
            cause: ZerospinError.prettyUnknownFailure(cause),
          });
          await this.partitionStore.db
            .update(serviceFrontendReplicas)
            .set({
              socketState: 'disconnected',
              lastFailure: ZerospinError.stringify(failure),
              updatedAt: new Date(),
            })
            .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.socketState = 'disconnected';
          this.catalogRow.lastFailure = ZerospinError.stringify(failure);
          await this.scheduleReconnect();
          return;
        }
        this.socket = socket;

        socket.addEventListener('open', () => {
          void this.serialize(async () => {
            if (this.socket !== socket || selectedRegistration.released) {
              socket.close();
              return;
            }
            const snapshot = await this.getSnapshot();
            await this.partitionStore.db
              .update(serviceFrontendReplicas)
              .set({ socketState: 'replaying', updatedAt: new Date() })
              .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
              .run();
            this.catalogRow.socketState = 'replaying';
            socket.send(
              JSON.stringify({
                replicaGenerationId: snapshot.generationId,
                frontendIndex: snapshot.frontendIndex,
              }),
            );
          });
        });

        socket.addEventListener('message', event => {
          void (async () => {
            try {
              const message = Schema.decodeUnknownSync(
                serviceFrontendSocketMessageSchema,
              )(String(event.data), { onExcessProperty: 'error' });
              if (message.type === 'serviceFrontendBlock') {
                await this.applyServerLineageBlock(message.sync);
              } else {
                await this.serialize(async () => {
                  if (this.socket !== socket) return;
                  const snapshot = await this.getSnapshot();
                  if (message.type === 'replay-complete') {
                    if (
                      message.generationId !== snapshot.generationId ||
                      message.frontendIndex !== snapshot.frontendIndex
                    ) {
                      throw new ZerospinError({
                        code: 'service-frontend-websocket-replay-watermark-mismatch',
                        message:
                          'Replay completion does not match the committed service watermark',
                      });
                    }
                    await this.partitionStore.db
                      .update(serviceFrontendReplicas)
                      .set({
                        socketState: 'online',
                        reconnectAttempt: 0,
                        lastFailure: this.isFrontendVersionUpdateRequired
                          ? this.catalogRow.lastFailure
                          : null,
                        updatedAt: new Date(),
                      })
                      .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
                      .run();
                    this.catalogRow.socketState = 'online';
                    this.catalogRow.reconnectAttempt = 0;
                    if (!this.isFrontendVersionUpdateRequired) {
                      this.catalogRow.lastFailure = null;
                    }
                    return;
                  }
                  if (message.type === 'state-required') {
                    if (
                      message.systemId !== snapshot.systemId ||
                      message.generationId !== snapshot.generationId ||
                      message.serviceName !== snapshot.serviceName ||
                      message.actorId !== snapshot.actorId ||
                      message.actorName !== snapshot.actorName ||
                      message.frontendName !== snapshot.frontendName ||
                      message.frontendVersion !== snapshot.frontendVersion
                    ) {
                      throw new ZerospinError({
                        code: 'service-frontend-websocket-state-required-target-mismatch',
                        message:
                          'State-required control targets another service replica',
                      });
                    }
                    await this.repairFromProvider();
                    socket.close();
                    return;
                  }
                  const transitionStateRow = await this.db
                    .select()
                    .from(serviceReplicaState)
                    .where(eq(serviceReplicaState.id, 'srps_current'))
                    .get();
                  const appliedTransitionBlock =
                    transitionStateRow?.previousBlock === null ||
                    transitionStateRow?.previousBlock === undefined
                      ? null
                      : Schema.decodeUnknownSync(
                          Schema.parseJson(ServiceFrontendReplicaBlockSchema),
                        )(transitionStateRow.previousBlock, {
                          onExcessProperty: 'error',
                        });
                  if (
                    message.systemId !== snapshot.systemId ||
                    message.serviceName !== snapshot.serviceName ||
                    message.actorId !== snapshot.actorId ||
                    message.actorName !== snapshot.actorName ||
                    message.frontendName !== snapshot.frontendName ||
                    message.appliedBoundaryIndex !== snapshot.frontendIndex ||
                    appliedTransitionBlock === null ||
                    appliedTransitionBlock.systemId !== snapshot.systemId ||
                    appliedTransitionBlock.generationId !==
                      snapshot.generationId ||
                    appliedTransitionBlock.serviceName !==
                      snapshot.serviceName ||
                    appliedTransitionBlock.actorId !== snapshot.actorId ||
                    appliedTransitionBlock.actorName !== snapshot.actorName ||
                    appliedTransitionBlock.frontendName !==
                      snapshot.frontendName ||
                    appliedTransitionBlock.frontendVersion !==
                      snapshot.frontendVersion ||
                    appliedTransitionBlock.replicaIndex !==
                      snapshot.replicaIndex ||
                    appliedTransitionBlock.frontendIndex !==
                      message.appliedBoundaryIndex ||
                    appliedTransitionBlock.lineageBlock.kind !==
                      'generation-boundary' ||
                    appliedTransitionBlock.lineageBlock.systemId !==
                      snapshot.systemId ||
                    appliedTransitionBlock.lineageBlock.prevGenerationId !==
                      snapshot.generationId ||
                    appliedTransitionBlock.lineageBlock.generationId ===
                      snapshot.generationId ||
                    appliedTransitionBlock.lineageBlock.serviceName !==
                      snapshot.serviceName ||
                    appliedTransitionBlock.lineageBlock.actorId !==
                      snapshot.actorId ||
                    appliedTransitionBlock.lineageBlock.actorName !==
                      snapshot.actorName ||
                    appliedTransitionBlock.lineageBlock.frontendName !==
                      snapshot.frontendName ||
                    appliedTransitionBlock.lineageBlock.frontendIndex !==
                      message.appliedBoundaryIndex
                  ) {
                    throw new ZerospinError({
                      code: 'service-frontend-lineage-transition-boundary-unproven',
                      message:
                        'Lineage transition control does not match the applied service generation boundary',
                    });
                  }
                  let previousBoundaryGenerationId =
                    appliedTransitionBlock.lineageBlock.generationId;
                  let previousBoundaryIndex =
                    appliedTransitionBlock.lineageBlock.frontendIndex;
                  const visitedBoundaryGenerationIds = new Set<string>([
                    snapshot.generationId,
                    previousBoundaryGenerationId,
                  ]);
                  for (const remainingBoundary of message.remainingBoundaries) {
                    if (
                      remainingBoundary.systemId !== snapshot.systemId ||
                      remainingBoundary.prevGenerationId !==
                        previousBoundaryGenerationId ||
                      remainingBoundary.generationId ===
                        previousBoundaryGenerationId ||
                      visitedBoundaryGenerationIds.has(
                        remainingBoundary.generationId,
                      ) ||
                      remainingBoundary.serviceName !== snapshot.serviceName ||
                      remainingBoundary.actorId !== snapshot.actorId ||
                      remainingBoundary.actorName !== snapshot.actorName ||
                      remainingBoundary.frontendName !==
                        snapshot.frontendName ||
                      remainingBoundary.frontendIndex <= previousBoundaryIndex
                    ) {
                      throw new ZerospinError({
                        code: 'service-frontend-lineage-transition-boundary-chain-invalid',
                        message:
                          'Service transition descriptors do not form one ordered canonical lineage',
                      });
                    }
                    previousBoundaryGenerationId =
                      remainingBoundary.generationId;
                    previousBoundaryIndex = remainingBoundary.frontendIndex;
                    visitedBoundaryGenerationIds.add(
                      remainingBoundary.generationId,
                    );
                  }
                  if (previousBoundaryGenerationId !== message.generationId) {
                    throw new ZerospinError({
                      code: 'service-frontend-lineage-transition-boundary-target-mismatch',
                      message:
                        'Service transition descriptors do not reach the requested target generation',
                    });
                  }
                  this.isTransitionRequired = true;
                  const transition = Schema.encodeUnknownSync(
                    Schema.parseJson(
                      ServiceFrontendLineageTransitionRequiredSchema,
                    ),
                  )(message);
                  await this.partitionStore.db
                    .update(serviceFrontendReplicas)
                    .set({
                      pendingTransition: transition,
                      socketState: 'disconnected',
                      updatedAt: new Date(),
                    })
                    .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
                    .run();
                  this.catalogRow.pendingTransition = transition;
                  this.catalogRow.socketState = 'disconnected';
                  socket.close();
                });
              }
            } catch (cause) {
              await this.serialize(async () => {
                const failure = ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'service-frontend-websocket-message-failed',
                      message:
                        'Failed to process service frontend WebSocket message',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    });
                await this.partitionStore.db
                  .update(serviceFrontendReplicas)
                  .set({
                    socketState: 'disconnected',
                    lastFailure: ZerospinError.stringify(failure),
                    updatedAt: new Date(),
                  })
                  .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
                  .run();
                this.catalogRow.socketState = 'disconnected';
                this.catalogRow.lastFailure = ZerospinError.stringify(failure);
                try {
                  await this.repairFromProvider();
                } catch {
                  // The persisted failure remains authoritative until a provider can repair.
                }
                socket.close();
              });
            }
          })();
        });
        socket.addEventListener('error', () => {
          socket.close();
        });
        socket.addEventListener('close', () => {
          void this.serialize(async () => {
            if (this.socket !== socket) return;
            this.socket = null;
            await this.partitionStore.db
              .update(serviceFrontendReplicas)
              .set({ socketState: 'disconnected', updatedAt: new Date() })
              .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
              .run();
            this.catalogRow.socketState = 'disconnected';
            await this.scheduleReconnect();
          });
        });
      });
    }

    async applyServerLineageBlock(
      lineageBlock: IServiceFrontendLineageBlock,
    ): Promise<void> {
      await this.serialize(async () => {
        const current = await this.getSnapshot();
        if (
          lineageBlock.systemId !== current.systemId ||
          lineageBlock.serviceName !== current.serviceName ||
          lineageBlock.actorId !== current.actorId ||
          lineageBlock.actorName !== current.actorName ||
          lineageBlock.frontendName !== current.frontendName
        ) {
          throw new ZerospinError({
            code: 'service-frontend-websocket-block-target-mismatch',
            message: 'Service frontend lineage block targets another replica',
          });
        }
        const frontendIndex =
          lineageBlock.kind === 'generation-boundary'
            ? lineageBlock.frontendIndex
            : lineageBlock.frontendBlock.frontendIndex;
        const stateRow = await this.db
          .select()
          .from(serviceReplicaState)
          .where(eq(serviceReplicaState.id, 'srps_current'))
          .get();
        const previousBlock =
          stateRow?.previousBlock === null ||
          stateRow?.previousBlock === undefined
            ? null
            : Schema.decodeUnknownSync(
                Schema.parseJson(ServiceFrontendReplicaBlockSchema),
              )(stateRow.previousBlock);
        if (frontendIndex === current.frontendIndex) {
          if (
            previousBlock !== null &&
            JSON.stringify(
              Schema.encodeUnknownSync(ServiceFrontendLineageBlockSchema)(
                previousBlock.lineageBlock,
              ),
            ) ===
              JSON.stringify(
                Schema.encodeUnknownSync(ServiceFrontendLineageBlockSchema)(
                  lineageBlock,
                ),
              )
          ) {
            return;
          }
          throw new ZerospinError({
            code: 'service-frontend-websocket-block-conflicting-duplicate',
            message: 'Equal-index service frontend blocks have different bytes',
          });
        }
        if (frontendIndex !== current.frontendIndex + 1) {
          throw new ZerospinError({
            code: 'service-frontend-websocket-block-index-gap',
            message:
              'Service frontend lineage block is not the exact next index',
          });
        }
        if (
          lineageBlock.kind === 'generation-boundary' &&
          (lineageBlock.prevGenerationId !== current.generationId ||
            lineageBlock.generationId === current.generationId)
        ) {
          throw new ZerospinError({
            code: 'service-frontend-generation-boundary-invalid',
            message:
              'Service frontend generation boundary does not continue this replica',
          });
        }
        if (
          lineageBlock.kind === 'service-frontend' &&
          lineageBlock.generationId !== current.generationId
        ) {
          throw new ZerospinError({
            code: 'service-frontend-lineage-generation-mismatch',
            message:
              'Ordinary service frontend block belongs to another generation',
          });
        }

        const replicaIndex = current.replicaIndex + 1;
        const replicaBlock: IServiceFrontendReplicaBlock = {
          systemId: current.systemId,
          generationId: current.generationId,
          serviceName: current.serviceName,
          actorId: current.actorId,
          actorName: current.actorName,
          frontendName: current.frontendName,
          frontendVersion: current.frontendVersion,
          replicaIndex,
          frontendIndex,
          lineageBlock,
        };
        await runtime.runPromise(
          makeTxAsync({
            db: this.db,
            program: ({ tx }) =>
              Effect.tryPromise({
                try: async () => {
                  if (lineageBlock.kind === 'service-frontend') {
                    for (const resource of [
                      ...lineageBlock.frontendBlock.delta.inserted,
                      ...lineageBlock.frontendBlock.delta.updated,
                    ]) {
                      const resourceSchema =
                        this.resourceSchemas[resource.modelName];
                      if (resourceSchema === undefined) {
                        throw new ZerospinError({
                          code: 'service-frontend-server-resource-model-missing',
                          message: `Server resource model "${resource.modelName}" is not in the acquired service spec`,
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
                    for (const removed of lineageBlock.frontendBlock.delta
                      .deleted) {
                      const resourceSchema =
                        this.resourceSchemas[removed.modelName];
                      if (resourceSchema === undefined) {
                        throw new ZerospinError({
                          code: 'service-frontend-server-resource-model-missing',
                          message: `Server resource model "${removed.modelName}" is not in the acquired service spec`,
                        });
                      }
                      await tx
                        .delete(resourceSchema)
                        .where(sql`id = ${removed.id}`)
                        .run();
                    }
                  }
                  const resources: IEncodedResourceShape[] = [];
                  for (const resourceSchema of Object.values(
                    this.resourceSchemas,
                  )) {
                    const rows = await tx.select().from(resourceSchema).all();
                    for (const row of rows) {
                      resources.push(
                        Schema.validateSync(EncodedResourceSchema)(row),
                      );
                    }
                  }
                  const state: IServiceFrontendReplicaState = {
                    ...current,
                    replicaIndex,
                    frontendIndex,
                    resources,
                  };
                  await tx
                    .update(serviceReplicaState)
                    .set({
                      state: Schema.encodeUnknownSync(
                        Schema.parseJson(ServiceFrontendReplicaStateSchema),
                      )(state),
                      previousBlock: Schema.encodeUnknownSync(
                        Schema.parseJson(ServiceFrontendReplicaBlockSchema),
                      )(replicaBlock),
                    })
                    .where(eq(serviceReplicaState.id, 'srps_current'))
                    .run();
                },
                catch: cause =>
                  ZerospinError.isZerospinError(cause)
                    ? cause
                    : new ZerospinError({
                        code: 'apply-service-frontend-server-block-failed',
                        message:
                          'Failed to apply service frontend server block',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
              }).pipe(Effect.withSpan('applyServiceFrontendServerBlock')),
          }),
        );
        await this.partitionStore.db
          .update(serviceFrontendReplicas)
          .set({ replicaIndex, frontendIndex, updatedAt: new Date() })
          .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
          .run();
        this.catalogRow.replicaIndex = replicaIndex;
        this.catalogRow.frontendIndex = frontendIndex;
        await this.fanoutBlock(replicaBlock);
      });
    }

    async release(registrationId: string): Promise<void> {
      await this.serialize(async () => {
        const registration = this.providers.find(
          candidate => candidate.id === registrationId,
        );
        if (registration === undefined || registration.released) return;
        registration.released = true;
        if (registration.provider instanceof RpcStub) {
          registration.provider[Symbol.dispose]();
        }
        registration.bufferedBlocks = [];
        if (this.providers.every(candidate => candidate.released)) {
          this.socket?.close();
          this.socket = null;
          if (this.reconnectFiber !== null) {
            runtime.runFork(Fiber.interrupt(this.reconnectFiber));
            this.reconnectFiber = null;
          }
          await this.partitionStore.db
            .update(serviceFrontendReplicas)
            .set({ socketState: 'disconnected', updatedAt: new Date() })
            .where(eq(serviceFrontendReplicas.id, this.catalogRow.id))
            .run();
          this.catalogRow.socketState = 'disconnected';
        }
      });
    }

    async releaseOwner(ownerToken: object): Promise<void> {
      const registrations = this.providers.filter(
        candidate => candidate.ownerToken === ownerToken && !candidate.released,
      );
      for (const registration of registrations) {
        await this.release(registration.id);
      }
    }

    activeProviderCount(): number {
      return this.providers.filter(registration => !registration.released)
        .length;
    }
  }

  const accountReplicaRuntimes = new Map<string, AccountReplicaRuntime>();
  const serviceReplicaRuntimes = new Map<string, ServiceReplicaRuntime>();

  class PartitionApi extends RpcTarget implements IPartitionApi {
    constructor(
      private readonly props: {
        partitionKey: string;
        ownerToken: object;
      },
    ) {
      super();
    }

    async acquireFrontendReplica(
      props: Parameters<IPartitionApi['acquireFrontendReplica']>[0],
    ): ReturnType<IPartitionApi['acquireFrontendReplica']> {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            if (
              props.frontendSpec.accountName !== props.accountName ||
              props.frontendSpec.actorName !== props.actorName ||
              props.frontendSpec.frontendName !== props.frontendName ||
              props.frontendSpec.version !== props.frontendVersion ||
              props.frontendSpecHash.length === 0
            ) {
              throw new ZerospinError({
                code: 'account-frontend-replica-spec-target-mismatch',
                message:
                  'Account frontend replica spec does not match acquisition target',
              });
            }
            const requestedFrontendSpecHash = await runtime.runPromise(
              makeFrontendSpecHash(props.frontendSpec),
            );
            if (requestedFrontendSpecHash !== props.frontendSpecHash) {
              throw new ZerospinError({
                code: 'account-frontend-replica-spec-hash-invalid',
                message: 'Account frontend replica spec hash is not canonical',
              });
            }
            const resultPromise = partitionStore.acquisitionTail.then(
              async () => {
                const matchingRows = await partitionStore.db
                  .select()
                  .from(accountFrontendReplicas)
                  .where(
                    and(
                      eq(accountFrontendReplicas.accountId, props.accountId),
                      eq(
                        accountFrontendReplicas.accountName,
                        props.accountName,
                      ),
                      eq(accountFrontendReplicas.actorId, props.actorId),
                      eq(accountFrontendReplicas.actorName, props.actorName),
                      eq(
                        accountFrontendReplicas.frontendName,
                        props.frontendName,
                      ),
                      eq(
                        accountFrontendReplicas.frontendVersion,
                        props.frontendVersion,
                      ),
                    ),
                  )
                  .orderBy(desc(accountFrontendReplicas.createdAt))
                  .all();
                let catalogRow = matchingRows.find(
                  row => row.status === 'ready',
                );
                if (catalogRow === undefined) {
                  catalogRow = matchingRows.find(
                    row => row.status === 'commissioning',
                  );
                }

                if (props.authority === 'cached-offline') {
                  if (
                    catalogRow === undefined ||
                    catalogRow.status !== 'ready' ||
                    catalogRow.frontendSpecHash !== props.frontendSpecHash
                  ) {
                    throw new ZerospinError({
                      code: 'cached-account-frontend-replica-unavailable',
                      message:
                        'No exact ready account frontend replica is available offline',
                    });
                  }
                }

                if (
                  catalogRow !== undefined &&
                  (catalogRow.frontendSpecHash !== props.frontendSpecHash ||
                    (await runtime.runPromise(
                      makeFrontendSpecHash(
                        Schema.decodeUnknownSync(Schema.parseJson())(
                          catalogRow.frontendSpec,
                        ),
                      ),
                    )) !== catalogRow.frontendSpecHash)
                ) {
                  throw new ZerospinError({
                    code: 'account-frontend-replica-spec-hash-mismatch',
                    message:
                      'Persisted account frontend spec hash does not match loaded code',
                  });
                }

                if (
                  catalogRow?.status === 'commissioning' ||
                  catalogRow?.journalHealth === 'unverified'
                ) {
                  const interruptedCatalogRow = catalogRow;
                  try {
                    const allJournalRows = await partitionStore.db
                      .select()
                      .from(accountFrontendCommandJournal)
                      .all();
                    const replicaJournalRows = allJournalRows.filter(
                      row =>
                        row.accountId === interruptedCatalogRow.accountId &&
                        row.accountName === interruptedCatalogRow.accountName &&
                        row.actorId === interruptedCatalogRow.actorId &&
                        row.actorName === interruptedCatalogRow.actorName &&
                        row.frontendName ===
                          interruptedCatalogRow.frontendName &&
                        ((row.journalKind === 'source' &&
                          row.sourceGenerationId === generationId &&
                          row.frontendVersion ===
                            interruptedCatalogRow.frontendVersion) ||
                          (row.journalKind === 'adapted' &&
                            row.targetGenerationId === generationId &&
                            row.targetFrontendVersion ===
                              interruptedCatalogRow.frontendVersion)),
                    );
                    for (const row of replicaJournalRows) {
                      Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Union(
                            StagedCommandSchema,
                            PushedCommandSchema,
                            ExecutedPushedCommandSchema,
                            FailedStagedCommandSchema,
                            FailedPushedCommandSchema,
                          ),
                        ),
                      )(row.command);
                      Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedFrontendMutationSchema),
                        ),
                      )(row.mutations);
                      Schema.decodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAppliedMutationSchema),
                        ),
                      )(row.appliedMutations);
                      if (row.sourceCommand !== null) {
                        Schema.decodeUnknownSync(
                          Schema.parseJson(StagedCommandSchema),
                        )(row.sourceCommand);
                      }
                      if (row.pushProvenance !== null) {
                        Schema.decodeUnknownSync(
                          Schema.parseJson(PushedCommandSchema),
                        )(row.pushProvenance);
                      }
                      if (row.terminalOutcome !== null) {
                        Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Union(
                              ExecutedPushedCommandSchema,
                              FailedStagedCommandSchema,
                              FailedPushedCommandSchema,
                            ),
                          ),
                        )(row.terminalOutcome);
                      }
                      for (const candidate of allJournalRows) {
                        if (
                          candidate.id === row.id ||
                          candidate.commandId !== row.commandId
                        ) {
                          continue;
                        }
                        const forwardLineage =
                          row.targetGenerationId ===
                            candidate.sourceGenerationId &&
                          row.targetFrontendVersion ===
                            candidate.frontendVersion;
                        const reverseLineage =
                          candidate.targetGenerationId ===
                            row.sourceGenerationId &&
                          candidate.targetFrontendVersion ===
                            row.frontendVersion;
                        const sourceAndAdaptedPair =
                          row.journalKind !== candidate.journalKind &&
                          row.sourceGenerationId ===
                            candidate.sourceGenerationId &&
                          row.accountId === candidate.accountId &&
                          row.accountName === candidate.accountName &&
                          row.actorId === candidate.actorId &&
                          row.actorName === candidate.actorName &&
                          row.frontendName === candidate.frontendName &&
                          row.frontendVersion === candidate.frontendVersion;
                        if (
                          !forwardLineage &&
                          !reverseLineage &&
                          !sourceAndAdaptedPair
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-command-ownership-ambiguous',
                            message: `Command "${row.commandId}" has unrelated journal owners`,
                          });
                        }
                      }
                    }
                    await partitionStore.db
                      .update(accountFrontendReplicas)
                      .set({
                        journalHealth: 'healthy',
                        lastFailure: null,
                        updatedAt: new Date(),
                      })
                      .where(
                        eq(
                          accountFrontendReplicas.id,
                          interruptedCatalogRow.id,
                        ),
                      )
                      .run();
                    interruptedCatalogRow.journalHealth = 'healthy';
                    interruptedCatalogRow.lastFailure = null;
                  } catch (cause) {
                    const failure = ZerospinError.isZerospinError(cause)
                      ? cause
                      : new ZerospinError({
                          code: 'account-frontend-journal-verification-failed',
                          message:
                            'Interrupted account commission journal could not be verified',
                          cause: ZerospinError.prettyUnknownFailure(cause),
                        });
                    await partitionStore.db
                      .update(accountFrontendReplicas)
                      .set({
                        journalHealth: 'corrupt',
                        lastFailure: ZerospinError.stringify(failure),
                        updatedAt: new Date(),
                      })
                      .where(
                        eq(
                          accountFrontendReplicas.id,
                          interruptedCatalogRow.id,
                        ),
                      )
                      .run();
                    interruptedCatalogRow.journalHealth = 'corrupt';
                    interruptedCatalogRow.lastFailure =
                      ZerospinError.stringify(failure);
                    throw failure;
                  }
                }

                let commissioningFrontendState: IFrontendSyncState | undefined;
                if (
                  catalogRow?.status === 'commissioning' ||
                  catalogRow === undefined
                ) {
                  if (props.authority !== 'online') {
                    throw new ZerospinError({
                      code: 'cached-account-frontend-replica-create-forbidden',
                      message:
                        'Cached-offline authority cannot create or resume a replica',
                    });
                  }
                  commissioningFrontendState = await runtime.runPromise(
                    decodeRpc(await props.provider.getFrontendState()),
                  );
                  if (
                    commissioningFrontendState.systemId !== systemId ||
                    commissioningFrontendState.generationId !== generationId ||
                    commissioningFrontendState.accountId !== props.accountId ||
                    commissioningFrontendState.accountName !==
                      props.accountName ||
                    commissioningFrontendState.actorId !== props.actorId ||
                    commissioningFrontendState.actorName !== props.actorName ||
                    commissioningFrontendState.frontendName !==
                      props.frontendName
                  ) {
                    throw new ZerospinError({
                      code: 'account-frontend-replica-state-target-mismatch',
                      message:
                        'Authoritative account state does not match acquisition target',
                    });
                  }
                }

                if (catalogRow === undefined) {
                  if (commissioningFrontendState === undefined) {
                    throw new ZerospinError({
                      code: 'account-frontend-replica-state-missing',
                      message:
                        'Online account commission requires authoritative state',
                    });
                  }
                  const replicaId = await runtime.runPromise(
                    makeIdFromAbbreviation({ abbreviation: 'afrp' }),
                  );
                  const now = new Date();
                  await partitionStore.db
                    .insert(accountFrontendReplicas)
                    .values({
                      id: replicaId,
                      accountId: props.accountId,
                      accountName: props.accountName,
                      actorId: props.actorId,
                      actorName: props.actorName,
                      frontendName: props.frontendName,
                      frontendVersion: props.frontendVersion,
                      frontendSpecHash: props.frontendSpecHash,
                      frontendSpec: Schema.encodeUnknownSync(
                        Schema.parseJson(),
                      )(props.frontendSpec),
                      sourceTargets: Schema.encodeUnknownSync(
                        Schema.parseJson(accountFrontendSourceTargetsSchema),
                      )([]),
                      databaseName: replicaDatabaseName,
                      previousDatabaseNames: Schema.encodeUnknownSync(
                        Schema.parseJson(Schema.Array(Schema.String)),
                      )([]),
                      status: 'commissioning',
                      role: props.role,
                      replicaIndex: 0,
                      frontendIndex: commissioningFrontendState.frontendIndex,
                      systemVersion: commissioningFrontendState.systemVersion,
                      systemWorkerName:
                        commissioningFrontendState.systemWorkerName,
                      pendingTransition: null,
                      socketState: 'disconnected',
                      reconnectAttempt: 0,
                      journalHealth: 'unverified',
                      writeSuspended: false,
                      lastFailure: null,
                      createdAt: now,
                      updatedAt: now,
                    })
                    .run();
                  catalogRow = (
                    await partitionStore.db
                      .select()
                      .from(accountFrontendReplicas)
                      .where(eq(accountFrontendReplicas.id, replicaId))
                      .all()
                  )[0];
                  if (catalogRow === undefined) {
                    throw new ZerospinError({
                      code: 'account-frontend-replica-catalog-insert-missing',
                      message:
                        'Inserted account frontend replica row was not found',
                    });
                  }
                }

                const runtimeKey = `${this.props.partitionKey}/account/${catalogRow.id}`;
                let replicaRuntime = accountReplicaRuntimes.get(runtimeKey);
                if (replicaRuntime === undefined) {
                  const resourceSchemas: IAnyDrizzleSchemas = {};
                  for (const [modelName, modelSpec] of Object.entries(
                    props.frontendSpec.models,
                  )) {
                    const decodedIndexes: Array<{
                      name: string;
                      columns: [string, ...string[]];
                      unique?: boolean;
                    }> = [];
                    for (const indexSpec of modelSpec.indexes) {
                      const [firstColumn, ...otherColumns] = indexSpec.columns;
                      if (firstColumn === undefined) {
                        throw new ZerospinError({
                          code: 'account-frontend-replica-index-empty',
                          message: `Frontend model "${modelName}" contains an empty index`,
                        });
                      }
                      decodedIndexes.push({
                        name: indexSpec.name,
                        columns: [firstColumn, ...otherColumns],
                        ...(indexSpec.unique === undefined
                          ? {}
                          : { unique: indexSpec.unique }),
                      });
                    }
                    resourceSchemas[modelName] =
                      makeDrizzleSchemaFromEncodedTable({
                        name: modelSpec.modelName,
                        shape: Schema.decodeUnknownSync(encodedShapeSchema)(
                          modelSpec.properties,
                        ),
                        indexes: decodedIndexes,
                      });
                  }
                  const completeReplicaDbConfig = {
                    schema: {
                      ...resourceSchemas,
                      ...accountReplicaDbConfig.schema,
                    },
                    relations: accountReplicaDbConfig.relations,
                  };
                  const replicaSqlite = await makeIdbSQLite3({
                    databaseName: catalogRow.databaseName,
                    vfsName: `${partitionStore.vfsName}/account/${catalogRow.id}`,
                    wasmUrl: sharedWorkerWasmUrl,
                  });
                  const db = makeAsyncWaSqliteDrizzle(
                    replicaSqlite,
                    completeReplicaDbConfig,
                  );
                  await runtime.runPromise(
                    migrateDbAsync({
                      db,
                      schema: completeReplicaDbConfig.schema,
                    }),
                  );
                  if (catalogRow.pendingTransition !== null) {
                    try {
                      const pendingTransition = Schema.decodeUnknownSync(
                        Schema.parseJson(
                          FrontendLineageTransitionRequiredSchema,
                        ),
                      )(catalogRow.pendingTransition, {
                        onExcessProperty: 'error',
                      });
                      const transitionStateRow = await db
                        .select()
                        .from(accountReplicaState)
                        .where(eq(accountReplicaState.id, 'arps_current'))
                        .get();
                      const transitionState =
                        transitionStateRow === undefined
                          ? null
                          : Schema.decodeUnknownSync(
                              Schema.parseJson(FrontendReplicaStateSchema),
                            )(transitionStateRow.state, {
                              onExcessProperty: 'error',
                            });
                      const appliedTransitionBlock =
                        transitionStateRow?.previousBlock === null ||
                        transitionStateRow?.previousBlock === undefined
                          ? null
                          : Schema.decodeUnknownSync(
                              Schema.parseJson(FrontendReplicaBlockSchema),
                            )(transitionStateRow.previousBlock, {
                              onExcessProperty: 'error',
                            });
                      if (
                        transitionState === null ||
                        pendingTransition.systemId !== systemId ||
                        pendingTransition.accountId !== catalogRow.accountId ||
                        pendingTransition.accountName !==
                          catalogRow.accountName ||
                        pendingTransition.actorId !== catalogRow.actorId ||
                        pendingTransition.actorName !== catalogRow.actorName ||
                        pendingTransition.frontendName !==
                          catalogRow.frontendName ||
                        pendingTransition.appliedBoundaryIndex !==
                          catalogRow.frontendIndex ||
                        transitionState.systemId !== systemId ||
                        transitionState.generationId !== generationId ||
                        transitionState.accountId !== catalogRow.accountId ||
                        transitionState.accountName !==
                          catalogRow.accountName ||
                        transitionState.actorId !== catalogRow.actorId ||
                        transitionState.actorName !== catalogRow.actorName ||
                        transitionState.frontendName !==
                          catalogRow.frontendName ||
                        transitionState.frontendVersion !==
                          catalogRow.frontendVersion ||
                        transitionState.replicaIndex !==
                          catalogRow.replicaIndex ||
                        transitionState.frontendIndex !==
                          catalogRow.frontendIndex ||
                        appliedTransitionBlock?.kind !== 'server' ||
                        appliedTransitionBlock.systemId !== systemId ||
                        appliedTransitionBlock.generationId !== generationId ||
                        appliedTransitionBlock.accountId !==
                          catalogRow.accountId ||
                        appliedTransitionBlock.accountName !==
                          catalogRow.accountName ||
                        appliedTransitionBlock.actorId !== catalogRow.actorId ||
                        appliedTransitionBlock.actorName !==
                          catalogRow.actorName ||
                        appliedTransitionBlock.frontendName !==
                          catalogRow.frontendName ||
                        appliedTransitionBlock.frontendVersion !==
                          catalogRow.frontendVersion ||
                        appliedTransitionBlock.replicaIndex !==
                          catalogRow.replicaIndex ||
                        appliedTransitionBlock.frontendIndex !==
                          pendingTransition.appliedBoundaryIndex ||
                        appliedTransitionBlock.lineageBlock.kind !==
                          'generation-boundary' ||
                        appliedTransitionBlock.lineageBlock.systemId !==
                          systemId ||
                        appliedTransitionBlock.lineageBlock.prevGenerationId !==
                          generationId ||
                        appliedTransitionBlock.lineageBlock.generationId ===
                          generationId ||
                        appliedTransitionBlock.lineageBlock.accountId !==
                          catalogRow.accountId ||
                        appliedTransitionBlock.lineageBlock.accountName !==
                          catalogRow.accountName ||
                        appliedTransitionBlock.lineageBlock.actorId !==
                          catalogRow.actorId ||
                        appliedTransitionBlock.lineageBlock.actorName !==
                          catalogRow.actorName ||
                        appliedTransitionBlock.lineageBlock.frontendName !==
                          catalogRow.frontendName ||
                        appliedTransitionBlock.lineageBlock.frontendIndex !==
                          pendingTransition.appliedBoundaryIndex
                      ) {
                        throw new ZerospinError({
                          code: 'account-frontend-persisted-transition-boundary-unproven',
                          message:
                            'Persisted account transition does not match the applied generation boundary',
                        });
                      }
                      let previousBoundaryGenerationId =
                        appliedTransitionBlock.lineageBlock.generationId;
                      let previousBoundaryIndex =
                        appliedTransitionBlock.lineageBlock.frontendIndex;
                      const visitedBoundaryGenerationIds = new Set<string>([
                        generationId,
                        previousBoundaryGenerationId,
                      ]);
                      for (const remainingBoundary of pendingTransition.remainingBoundaries) {
                        if (
                          remainingBoundary.systemId !== systemId ||
                          remainingBoundary.prevGenerationId !==
                            previousBoundaryGenerationId ||
                          remainingBoundary.generationId ===
                            previousBoundaryGenerationId ||
                          visitedBoundaryGenerationIds.has(
                            remainingBoundary.generationId,
                          ) ||
                          remainingBoundary.accountId !==
                            catalogRow.accountId ||
                          remainingBoundary.accountName !==
                            catalogRow.accountName ||
                          remainingBoundary.actorId !== catalogRow.actorId ||
                          remainingBoundary.actorName !==
                            catalogRow.actorName ||
                          remainingBoundary.frontendName !==
                            catalogRow.frontendName ||
                          remainingBoundary.frontendIndex <=
                            previousBoundaryIndex
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-persisted-transition-boundary-chain-invalid',
                            message:
                              'Persisted account transition descriptors are not one ordered canonical lineage',
                          });
                        }
                        previousBoundaryGenerationId =
                          remainingBoundary.generationId;
                        previousBoundaryIndex = remainingBoundary.frontendIndex;
                        visitedBoundaryGenerationIds.add(
                          remainingBoundary.generationId,
                        );
                      }
                      if (
                        previousBoundaryGenerationId !==
                        pendingTransition.generationId
                      ) {
                        throw new ZerospinError({
                          code: 'account-frontend-persisted-transition-boundary-target-mismatch',
                          message:
                            'Persisted account transition descriptors do not reach their target generation',
                        });
                      }
                    } catch (cause) {
                      const failure = new ZerospinError({
                        code: 'account-frontend-persisted-transition-unproven',
                        message:
                          'The account replica contains an unproven persisted lineage transition',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      });
                      await partitionStore.db
                        .update(accountFrontendReplicas)
                        .set({
                          status: 'failed',
                          lastFailure: ZerospinError.stringify(failure),
                          updatedAt: new Date(),
                        })
                        .where(eq(accountFrontendReplicas.id, catalogRow.id))
                        .run();
                      catalogRow.status = 'failed';
                      catalogRow.lastFailure = ZerospinError.stringify(failure);
                      throw failure;
                    }
                  }
                  replicaRuntime = new AccountReplicaRuntime(
                    catalogRow,
                    partitionStore,
                    db,
                    resourceSchemas,
                    props.frontendSpec,
                  );
                  accountReplicaRuntimes.set(runtimeKey, replicaRuntime);
                }

                if (catalogRow.status !== 'ready') {
                  if (commissioningFrontendState === undefined) {
                    throw new ZerospinError({
                      code: 'account-frontend-replica-state-missing',
                      message:
                        'Account commission cannot continue without authoritative state',
                    });
                  }
                  await replicaRuntime.serialize(() =>
                    replicaRuntime.replaceFromServer(
                      commissioningFrontendState,
                    ),
                  );
                } else {
                  if (catalogRow.journalHealth === 'corrupt') {
                    throw new ZerospinError({
                      code: 'account-frontend-journal-corrupt',
                      message:
                        'A corrupt account journal cannot authorize replica acquisition',
                    });
                  }
                  await replicaRuntime.serialize(async () => {
                    const allJournalRows = await partitionStore.db
                      .select()
                      .from(accountFrontendCommandJournal)
                      .all();
                    const recoveryRows: Array<{
                      row: typeof accountFrontendCommandJournal.$inferSelect;
                      command: IEncodedCommand<IStagedCommand>;
                      mutations: readonly IEncodedFrontendMutation[];
                    }> = [];

                    try {
                      for (const row of allJournalRows) {
                        const ownerColumnsMatch =
                          row.accountId === catalogRow.accountId &&
                          row.accountName === catalogRow.accountName &&
                          row.actorId === catalogRow.actorId &&
                          row.actorName === catalogRow.actorName &&
                          row.frontendName === catalogRow.frontendName;
                        if (!ownerColumnsMatch) {
                          continue;
                        }
                        const sourceCandidate =
                          row.journalKind === 'source' &&
                          row.sourceGenerationId === generationId &&
                          row.frontendVersion === catalogRow.frontendVersion;
                        const targetCandidate =
                          row.journalKind === 'adapted' &&
                          row.targetGenerationId === generationId &&
                          row.targetFrontendVersion ===
                            catalogRow.frontendVersion;
                        if (!sourceCandidate && !targetCandidate) {
                          continue;
                        }

                        const decodedCommand = Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Union(
                              StagedCommandSchema,
                              PushedCommandSchema,
                              ExecutedPushedCommandSchema,
                              FailedStagedCommandSchema,
                              FailedPushedCommandSchema,
                            ),
                          ),
                        )(row.command, { onExcessProperty: 'error' });
                        const decodedMutations = Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedFrontendMutationSchema),
                          ),
                        )(row.mutations, { onExcessProperty: 'error' });
                        const decodedAppliedMutations =
                          Schema.decodeUnknownSync(
                            Schema.parseJson(
                              Schema.Array(EncodedAppliedMutationSchema),
                            ),
                          )(row.appliedMutations, {
                            onExcessProperty: 'error',
                          });
                        const decodedSourceCommand =
                          row.sourceCommand === null
                            ? null
                            : Schema.decodeUnknownSync(
                                Schema.parseJson(StagedCommandSchema),
                              )(row.sourceCommand, {
                                onExcessProperty: 'error',
                              });
                        const decodedPushProvenance =
                          row.pushProvenance === null
                            ? null
                            : Schema.decodeUnknownSync(
                                Schema.parseJson(PushedCommandSchema),
                              )(row.pushProvenance, {
                                onExcessProperty: 'error',
                              });
                        const decodedTerminalOutcome =
                          row.terminalOutcome === null
                            ? null
                            : Schema.decodeUnknownSync(
                                Schema.parseJson(
                                  Schema.Union(
                                    ExecutedPushedCommandSchema,
                                    FailedStagedCommandSchema,
                                    FailedPushedCommandSchema,
                                  ),
                                ),
                              )(row.terminalOutcome, {
                                onExcessProperty: 'error',
                              });

                        if (
                          decodedCommand.id !== row.commandId ||
                          decodedCommand.accountId !== row.accountId ||
                          decodedCommand.accountName !== row.accountName ||
                          decodedCommand.actorId !== row.actorId ||
                          decodedCommand.actorName !== row.actorName ||
                          decodedCommand.frontendName !== row.frontendName ||
                          decodedCommand.stagedCursor !== row.stagedCursor ||
                          decodedCommand.stagedAt.getTime() !== row.stagedAt
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-command-provenance-conflict',
                            message:
                              'The durable command does not match its journal owner and staging provenance',
                            extra: {
                              commandId: row.commandId,
                              decodedCommandId: decodedCommand.id,
                              commandAccountId: decodedCommand.accountId,
                              rowAccountId: row.accountId,
                              commandActorId: decodedCommand.actorId,
                              rowActorId: row.actorId,
                              commandStagedCursor: decodedCommand.stagedCursor,
                              rowStagedCursor: row.stagedCursor,
                              commandStagedAt:
                                decodedCommand.stagedAt.getTime(),
                              rowStagedAt: row.stagedAt,
                            },
                          });
                        }
                        for (const [
                          mutationIndex,
                          mutation,
                        ] of decodedMutations.entries()) {
                          if (
                            mutation.commandId !== row.commandId ||
                            mutation.mutationIndex !== mutationIndex
                          ) {
                            throw new ZerospinError({
                              code: 'account-frontend-journal-mutation-provenance-conflict',
                              message:
                                'A durable mutation does not match its command or sequence',
                              extra: { commandId: row.commandId },
                            });
                          }
                        }
                        for (const [
                          mutationIndex,
                          mutation,
                        ] of decodedAppliedMutations.entries()) {
                          if (
                            mutation.commandId !== row.commandId ||
                            mutation.mutationIndex !== mutationIndex
                          ) {
                            throw new ZerospinError({
                              code: 'account-frontend-journal-applied-mutation-provenance-conflict',
                              message:
                                'A durable applied mutation does not match its command or sequence',
                              extra: { commandId: row.commandId },
                            });
                          }
                        }
                        if (
                          decodedSourceCommand === null &&
                          (decodedCommand.version !==
                            row.originalContractVersion ||
                            decodedCommand.payload !== row.originalPayload)
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-original-command-conflict',
                            message:
                              'The durable command does not match its original contract provenance',
                            extra: { commandId: row.commandId },
                          });
                        }
                        if (
                          decodedSourceCommand !== null &&
                          (decodedSourceCommand.id !== row.commandId ||
                            decodedSourceCommand.accountId !== row.accountId ||
                            decodedSourceCommand.accountName !==
                              row.accountName ||
                            decodedSourceCommand.actorId !== row.actorId ||
                            decodedSourceCommand.actorName !== row.actorName ||
                            decodedSourceCommand.frontendName !==
                              row.frontendName ||
                            decodedSourceCommand.version !==
                              row.originalContractVersion ||
                            decodedSourceCommand.payload !==
                              row.originalPayload)
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-source-command-provenance-conflict',
                            message:
                              'The adapted source command does not match its journal provenance',
                            extra: { commandId: row.commandId },
                          });
                        }
                        if (
                          decodedPushProvenance !== null &&
                          (decodedPushProvenance.id !== row.commandId ||
                            decodedPushProvenance.accountId !== row.accountId ||
                            decodedPushProvenance.accountName !==
                              row.accountName ||
                            decodedPushProvenance.actorId !== row.actorId ||
                            decodedPushProvenance.actorName !== row.actorName ||
                            decodedPushProvenance.frontendName !==
                              row.frontendName ||
                            decodedPushProvenance.stagedCursor !==
                              row.stagedCursor)
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-push-provenance-conflict',
                            message:
                              'The pushed command provenance does not match its journal owner',
                            extra: { commandId: row.commandId },
                          });
                        }
                        if (
                          decodedTerminalOutcome !== null &&
                          (decodedTerminalOutcome.id !== row.commandId ||
                            decodedTerminalOutcome.accountId !==
                              row.accountId ||
                            decodedTerminalOutcome.accountName !==
                              row.accountName ||
                            decodedTerminalOutcome.actorId !== row.actorId ||
                            decodedTerminalOutcome.actorName !==
                              row.actorName ||
                            decodedTerminalOutcome.frontendName !==
                              row.frontendName ||
                            decodedTerminalOutcome.stagedCursor !==
                              row.stagedCursor)
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-terminal-provenance-conflict',
                            message:
                              'The terminal command provenance does not match its journal owner',
                            extra: { commandId: row.commandId },
                          });
                        }

                        for (const candidate of allJournalRows) {
                          if (
                            candidate.id === row.id ||
                            candidate.commandId !== row.commandId
                          ) {
                            continue;
                          }
                          const forwardLineage =
                            row.targetGenerationId ===
                              candidate.sourceGenerationId &&
                            row.targetFrontendVersion ===
                              candidate.frontendVersion;
                          const reverseLineage =
                            candidate.targetGenerationId ===
                              row.sourceGenerationId &&
                            candidate.targetFrontendVersion ===
                              row.frontendVersion;
                          const sourceAndAdaptedPair =
                            row.journalKind !== candidate.journalKind &&
                            row.sourceGenerationId ===
                              candidate.sourceGenerationId &&
                            row.accountId === candidate.accountId &&
                            row.accountName === candidate.accountName &&
                            row.actorId === candidate.actorId &&
                            row.actorName === candidate.actorName &&
                            row.frontendName === candidate.frontendName &&
                            row.frontendVersion === candidate.frontendVersion;
                          if (
                            !forwardLineage &&
                            !reverseLineage &&
                            !sourceAndAdaptedPair
                          ) {
                            throw new ZerospinError({
                              code: 'account-frontend-journal-command-ownership-ambiguous',
                              message: `Command "${row.commandId}" has unrelated journal owners`,
                            });
                          }
                        }

                        if (row.materializedReplicaIndex !== null) {
                          continue;
                        }
                        if (row.lifecycle !== 'staged') {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-unmaterialized-lifecycle-invalid',
                            message:
                              'An unmaterialized account journal row must still be staged',
                            extra: {
                              commandId: row.commandId,
                              lifecycle: row.lifecycle,
                            },
                          });
                        }
                        recoveryRows.push({
                          row,
                          command: Schema.validateSync(StagedCommandSchema)(
                            decodedCommand,
                            {
                              onExcessProperty: 'error',
                            },
                          ),
                          mutations: decodedMutations,
                        });
                      }
                    } catch (cause) {
                      const journalFailure = ZerospinError.isZerospinError(
                        cause,
                      )
                        ? cause
                        : new ZerospinError({
                            code: 'account-frontend-journal-verification-failed',
                            message:
                              'Account journal recovery bytes could not be verified',
                            cause: ZerospinError.prettyUnknownFailure(cause),
                          });
                      await partitionStore.db
                        .update(accountFrontendReplicas)
                        .set({
                          journalHealth: 'corrupt',
                          lastFailure: ZerospinError.stringify(journalFailure),
                          updatedAt: new Date(),
                        })
                        .where(eq(accountFrontendReplicas.id, catalogRow.id))
                        .run();
                      catalogRow.journalHealth = 'corrupt';
                      catalogRow.lastFailure =
                        ZerospinError.stringify(journalFailure);
                      throw journalFailure;
                    }

                    if (recoveryRows.length === 0) {
                      return;
                    }

                    const current = await replicaRuntime.getSnapshot();
                    const journalReceipts: Array<{
                      journalId: (typeof accountFrontendCommandJournal.$inferSelect)['id'];
                      appliedMutations: readonly IEncodedAppliedMutation[];
                      materializedReplicaIndex: number;
                    }> = [];
                    const rowsToMaterialize: typeof recoveryRows = [];

                    try {
                      for (const recoveryRow of recoveryRows.toSorted(
                        (left, right) =>
                          left.row.stagedCursor.localeCompare(
                            right.row.stagedCursor,
                          ),
                      )) {
                        const materializedCommand = current.stagedCommands.find(
                          command => command.id === recoveryRow.command.id,
                        );
                        if (materializedCommand === undefined) {
                          rowsToMaterialize.push(recoveryRow);
                          continue;
                        }
                        if (
                          Schema.encodeUnknownSync(
                            Schema.parseJson(StagedCommandSchema),
                          )(materializedCommand) !== recoveryRow.row.command
                        ) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-materialized-command-conflict',
                            message:
                              'The materialized command bytes differ from the durable journal',
                            extra: { commandId: recoveryRow.command.id },
                          });
                        }
                        const optimisticReceipt =
                          current.optimisticAppliedMutations.find(
                            receipt =>
                              receipt.commandId === recoveryRow.command.id,
                          );
                        if (optimisticReceipt === undefined) {
                          throw new ZerospinError({
                            code: 'account-frontend-journal-materialization-receipt-missing',
                            message:
                              'Materialized staged command has no optimistic mutation receipt',
                            extra: { commandId: recoveryRow.command.id },
                          });
                        }
                        journalReceipts.push({
                          journalId: recoveryRow.row.id,
                          appliedMutations: optimisticReceipt.mutations,
                          materializedReplicaIndex: current.replicaIndex,
                        });
                      }

                      let committedReplicaIndex = current.replicaIndex;
                      if (rowsToMaterialize.length > 0) {
                        committedReplicaIndex = current.replicaIndex + 1;
                        await runtime.runPromise(
                          makeTxAsync({
                            db: replicaRuntime.db,
                            program: ({ tx }) =>
                              Effect.tryPromise({
                                try: async () => {
                                  const stagedCommands = [
                                    ...current.stagedCommands,
                                  ];
                                  const optimisticAppliedMutations = [
                                    ...current.optimisticAppliedMutations,
                                  ];
                                  for (const recoveryRow of rowsToMaterialize) {
                                    const applied =
                                      await replicaRuntime.applyEncodedMutations(
                                        {
                                          tx,
                                          commandId: recoveryRow.command.id,
                                          mutations: recoveryRow.mutations,
                                          appliedAt:
                                            recoveryRow.command.stagedAt,
                                        },
                                      );
                                    stagedCommands.push(recoveryRow.command);
                                    optimisticAppliedMutations.push({
                                      commandId: recoveryRow.command.id,
                                      mutations: applied.appliedMutations,
                                    });
                                    journalReceipts.push({
                                      journalId: recoveryRow.row.id,
                                      appliedMutations:
                                        applied.appliedMutations,
                                      materializedReplicaIndex:
                                        committedReplicaIndex,
                                    });
                                  }
                                  const recoveredState: IFrontendReplicaState =
                                    {
                                      ...current,
                                      replicaIndex: committedReplicaIndex,
                                      resources:
                                        await replicaRuntime.collectResources(
                                          tx,
                                        ),
                                      stagedCommands,
                                      optimisticAppliedMutations,
                                    };
                                  await tx
                                    .update(accountReplicaState)
                                    .set({
                                      state: Schema.encodeUnknownSync(
                                        Schema.parseJson(
                                          FrontendReplicaStateSchema,
                                        ),
                                      )(recoveredState),
                                    })
                                    .where(
                                      eq(
                                        accountReplicaState.id,
                                        'arps_current',
                                      ),
                                    )
                                    .run();
                                },
                                catch: cause =>
                                  ZerospinError.isZerospinError(cause)
                                    ? cause
                                    : new ZerospinError({
                                        code: 'recover-account-frontend-journal-materialization-failed',
                                        message:
                                          'Failed to materialize durable account journal rows',
                                        cause:
                                          ZerospinError.prettyUnknownFailure(
                                            cause,
                                          ),
                                      }),
                              }).pipe(
                                Effect.withSpan(
                                  'recoverAccountFrontendJournalMaterialization',
                                ),
                              ),
                          }),
                        );
                      }

                      await runtime.runPromise(
                        makeTxAsync({
                          db: partitionStore.db,
                          program: ({ tx }) =>
                            Effect.tryPromise({
                              try: async () => {
                                for (const receipt of journalReceipts) {
                                  await tx
                                    .update(accountFrontendCommandJournal)
                                    .set({
                                      appliedMutations:
                                        Schema.encodeUnknownSync(
                                          Schema.parseJson(
                                            Schema.Array(
                                              EncodedAppliedMutationSchema,
                                            ),
                                          ),
                                        )(receipt.appliedMutations),
                                      materializedReplicaIndex:
                                        receipt.materializedReplicaIndex,
                                      updatedAt: new Date(),
                                    })
                                    .where(
                                      eq(
                                        accountFrontendCommandJournal.id,
                                        receipt.journalId,
                                      ),
                                    )
                                    .run();
                                }
                                await tx
                                  .update(accountFrontendReplicas)
                                  .set({
                                    replicaIndex: committedReplicaIndex,
                                    journalHealth: 'healthy',
                                    lastFailure: null,
                                    updatedAt: new Date(),
                                  })
                                  .where(
                                    eq(
                                      accountFrontendReplicas.id,
                                      catalogRow.id,
                                    ),
                                  )
                                  .run();
                              },
                              catch: cause =>
                                ZerospinError.isZerospinError(cause)
                                  ? cause
                                  : new ZerospinError({
                                      code: 'commit-account-frontend-journal-recovery-failed',
                                      message:
                                        'Failed to commit recovered account journal receipts',
                                      cause:
                                        ZerospinError.prettyUnknownFailure(
                                          cause,
                                        ),
                                    }),
                            }).pipe(
                              Effect.withSpan(
                                'commitAccountFrontendJournalRecovery',
                              ),
                            ),
                        }),
                      );
                      catalogRow.replicaIndex = committedReplicaIndex;
                      catalogRow.journalHealth = 'healthy';
                      catalogRow.lastFailure = null;
                      await replicaRuntime.fanoutReplacement(
                        await replicaRuntime.getSnapshot(),
                      );
                    } catch (cause) {
                      const recoveryFailure = ZerospinError.isZerospinError(
                        cause,
                      )
                        ? cause
                        : new ZerospinError({
                            code: 'account-frontend-journal-recovery-failed',
                            message: 'Account journal recovery failed closed',
                            cause: ZerospinError.prettyUnknownFailure(cause),
                          });
                      const recoveryFailureCode = String(recoveryFailure.code);
                      const corruptRecovery =
                        recoveryFailureCode ===
                          'account-frontend-journal-materialized-command-conflict' ||
                        recoveryFailureCode ===
                          'account-frontend-journal-materialization-receipt-missing' ||
                        recoveryFailureCode.startsWith('frontend-journal-');
                      if (corruptRecovery) {
                        await partitionStore.db
                          .update(accountFrontendReplicas)
                          .set({
                            journalHealth: 'corrupt',
                            lastFailure:
                              ZerospinError.stringify(recoveryFailure),
                            updatedAt: new Date(),
                          })
                          .where(eq(accountFrontendReplicas.id, catalogRow.id))
                          .run();
                        catalogRow.journalHealth = 'corrupt';
                        catalogRow.lastFailure =
                          ZerospinError.stringify(recoveryFailure);
                      } else {
                        await partitionStore.db
                          .update(accountFrontendReplicas)
                          .set({
                            lastFailure:
                              ZerospinError.stringify(recoveryFailure),
                            updatedAt: new Date(),
                          })
                          .where(eq(accountFrontendReplicas.id, catalogRow.id))
                          .run();
                        catalogRow.lastFailure =
                          ZerospinError.stringify(recoveryFailure);
                      }
                      throw recoveryFailure;
                    }
                  });
                  try {
                    await replicaRuntime.getSnapshot();
                  } catch (physicalCause) {
                    const physicalFailure = new ZerospinError({
                      code: 'account-frontend-replica-physical-corruption',
                      message:
                        'The account frontend materialization could not be read',
                      cause: ZerospinError.prettyUnknownFailure(physicalCause),
                    });
                    if (props.authority !== 'online') {
                      await partitionStore.db
                        .update(accountFrontendReplicas)
                        .set({
                          lastFailure: ZerospinError.stringify(physicalFailure),
                          updatedAt: new Date(),
                        })
                        .where(eq(accountFrontendReplicas.id, catalogRow.id))
                        .run();
                      catalogRow.lastFailure =
                        ZerospinError.stringify(physicalFailure);
                      throw physicalFailure;
                    }

                    try {
                      const allJournalRows = await partitionStore.db
                        .select()
                        .from(accountFrontendCommandJournal)
                        .all();
                      const replicaJournalRows = allJournalRows.filter(
                        row =>
                          row.accountId === catalogRow.accountId &&
                          row.accountName === catalogRow.accountName &&
                          row.actorId === catalogRow.actorId &&
                          row.actorName === catalogRow.actorName &&
                          row.frontendName === catalogRow.frontendName &&
                          ((row.journalKind === 'source' &&
                            row.sourceGenerationId === generationId &&
                            row.frontendVersion ===
                              catalogRow.frontendVersion) ||
                            (row.journalKind === 'adapted' &&
                              row.targetGenerationId === generationId &&
                              row.targetFrontendVersion ===
                                catalogRow.frontendVersion)),
                      );
                      for (const row of replicaJournalRows) {
                        Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Union(
                              StagedCommandSchema,
                              PushedCommandSchema,
                              ExecutedPushedCommandSchema,
                              FailedStagedCommandSchema,
                              FailedPushedCommandSchema,
                            ),
                          ),
                        )(row.command);
                        Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedFrontendMutationSchema),
                          ),
                        )(row.mutations);
                        Schema.decodeUnknownSync(
                          Schema.parseJson(
                            Schema.Array(EncodedAppliedMutationSchema),
                          ),
                        )(row.appliedMutations);
                        if (row.sourceCommand !== null) {
                          Schema.decodeUnknownSync(
                            Schema.parseJson(StagedCommandSchema),
                          )(row.sourceCommand);
                        }
                        if (row.pushProvenance !== null) {
                          Schema.decodeUnknownSync(
                            Schema.parseJson(PushedCommandSchema),
                          )(row.pushProvenance);
                        }
                        if (row.terminalOutcome !== null) {
                          Schema.decodeUnknownSync(
                            Schema.parseJson(
                              Schema.Union(
                                ExecutedPushedCommandSchema,
                                FailedStagedCommandSchema,
                                FailedPushedCommandSchema,
                              ),
                            ),
                          )(row.terminalOutcome);
                        }
                        for (const candidate of allJournalRows) {
                          if (
                            candidate.id === row.id ||
                            candidate.commandId !== row.commandId
                          ) {
                            continue;
                          }
                          const forwardLineage =
                            row.targetGenerationId ===
                              candidate.sourceGenerationId &&
                            row.targetFrontendVersion ===
                              candidate.frontendVersion;
                          const reverseLineage =
                            candidate.targetGenerationId ===
                              row.sourceGenerationId &&
                            candidate.targetFrontendVersion ===
                              row.frontendVersion;
                          const sourceAndAdaptedPair =
                            row.journalKind !== candidate.journalKind &&
                            row.sourceGenerationId ===
                              candidate.sourceGenerationId &&
                            row.accountId === candidate.accountId &&
                            row.accountName === candidate.accountName &&
                            row.actorId === candidate.actorId &&
                            row.actorName === candidate.actorName &&
                            row.frontendName === candidate.frontendName &&
                            row.frontendVersion === candidate.frontendVersion;
                          if (
                            !forwardLineage &&
                            !reverseLineage &&
                            !sourceAndAdaptedPair
                          ) {
                            throw new ZerospinError({
                              code: 'account-frontend-journal-command-ownership-ambiguous',
                              message: `Command "${row.commandId}" has unrelated journal owners`,
                            });
                          }
                        }
                      }
                    } catch (cause) {
                      const journalFailure = ZerospinError.isZerospinError(
                        cause,
                      )
                        ? cause
                        : new ZerospinError({
                            code: 'account-frontend-journal-verification-failed',
                            message:
                              'Corrupt account materialization journal could not be verified',
                            cause: ZerospinError.prettyUnknownFailure(cause),
                          });
                      await partitionStore.db
                        .update(accountFrontendReplicas)
                        .set({
                          journalHealth: 'corrupt',
                          lastFailure: ZerospinError.stringify(journalFailure),
                          updatedAt: new Date(),
                        })
                        .where(eq(accountFrontendReplicas.id, catalogRow.id))
                        .run();
                      catalogRow.journalHealth = 'corrupt';
                      catalogRow.lastFailure =
                        ZerospinError.stringify(journalFailure);
                      throw journalFailure;
                    }

                    const rebuildingFrontendState = await runtime.runPromise(
                      decodeRpc(await props.provider.getFrontendState()),
                    );
                    const replacement = await replicaRuntime.serialize(() =>
                      replicaRuntime.replaceFromServer(rebuildingFrontendState),
                    );
                    await replicaRuntime.serialize(() =>
                      replicaRuntime.fanoutReplacement(replacement),
                    );
                  }
                }

                const registrationId = await replicaRuntime.serialize(() =>
                  replicaRuntime.acquire({
                    provider: props.provider,
                    authority: props.authority,
                    role: props.role,
                    ownerToken: this.props.ownerToken,
                  }),
                );
                const acquiredRuntime = replicaRuntime;
                return new (class extends RpcTarget {
                  async getFrontendState() {
                    return runtime.runPromise(
                      Effect.tryPromise({
                        try: () =>
                          acquiredRuntime.getAcquiredState(registrationId),
                        catch: cause =>
                          ZerospinError.isZerospinError(cause)
                            ? cause
                            : new ZerospinError({
                                code: 'read-account-frontend-replica-failed',
                                message:
                                  'Failed to read account frontend replica',
                                cause:
                                  ZerospinError.prettyUnknownFailure(cause),
                              }),
                      }).pipe(encodeRpc),
                    );
                  }

                  async release() {
                    return runtime.runPromise(
                      Effect.tryPromise({
                        try: () => acquiredRuntime.release(registrationId),
                        catch: cause =>
                          ZerospinError.isZerospinError(cause)
                            ? cause
                            : new ZerospinError({
                                code: 'release-account-frontend-replica-failed',
                                message:
                                  'Failed to release account frontend replica',
                                cause:
                                  ZerospinError.prettyUnknownFailure(cause),
                              }),
                      }).pipe(encodeRpc),
                    );
                  }
                })();
              },
            );
            partitionStore.acquisitionTail = resultPromise.then(
              () => undefined,
              () => undefined,
            );
            return resultPromise;
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'acquire-account-frontend-replica-failed',
                  message: 'Failed to acquire account frontend replica',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async acquireServiceFrontendReplica(
      props: Parameters<IPartitionApi['acquireServiceFrontendReplica']>[0],
    ): ReturnType<IPartitionApi['acquireServiceFrontendReplica']> {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            if (
              props.frontendSpec.serviceName !== props.serviceName ||
              props.frontendSpec.actorName !== props.actorName ||
              props.frontendSpec.frontendName !== props.frontendName ||
              props.frontendSpec.version !== props.frontendVersion ||
              props.frontendSpecHash.length === 0
            ) {
              throw new ZerospinError({
                code: 'service-frontend-replica-spec-target-mismatch',
                message:
                  'Service frontend replica spec does not match acquisition target',
              });
            }
            const requestedFrontendSpecHash = await runtime.runPromise(
              makeFrontendSpecHash(props.frontendSpec),
            );
            if (requestedFrontendSpecHash !== props.frontendSpecHash) {
              throw new ZerospinError({
                code: 'service-frontend-replica-spec-hash-invalid',
                message: 'Service frontend replica spec hash is not canonical',
              });
            }

            const resultPromise = partitionStore.acquisitionTail.then(
              async () => {
                const matchingRows = await partitionStore.db
                  .select()
                  .from(serviceFrontendReplicas)
                  .where(
                    and(
                      eq(
                        serviceFrontendReplicas.serviceName,
                        props.serviceName,
                      ),
                      eq(serviceFrontendReplicas.actorId, props.actorId),
                      eq(serviceFrontendReplicas.actorName, props.actorName),
                      eq(
                        serviceFrontendReplicas.frontendName,
                        props.frontendName,
                      ),
                      eq(
                        serviceFrontendReplicas.frontendVersion,
                        props.frontendVersion,
                      ),
                    ),
                  )
                  .orderBy(desc(serviceFrontendReplicas.createdAt))
                  .all();
                let catalogRow = matchingRows.find(
                  row => row.status === 'ready',
                );
                if (props.authority === 'cached-offline') {
                  if (
                    catalogRow === undefined ||
                    catalogRow.frontendSpecHash !== props.frontendSpecHash
                  ) {
                    throw new ZerospinError({
                      code: 'cached-service-frontend-replica-unavailable',
                      message:
                        'No exact ready service frontend replica is available offline',
                    });
                  }
                }

                if (
                  catalogRow !== undefined &&
                  (catalogRow.frontendSpecHash !== props.frontendSpecHash ||
                    (await runtime.runPromise(
                      makeFrontendSpecHash(
                        Schema.decodeUnknownSync(Schema.parseJson())(
                          catalogRow.frontendSpec,
                        ),
                      ),
                    )) !== catalogRow.frontendSpecHash)
                ) {
                  throw new ZerospinError({
                    code: 'service-frontend-replica-spec-hash-mismatch',
                    message:
                      'Persisted service frontend spec hash does not match loaded code',
                  });
                }

                let commissioningFrontendState:
                  | IServiceFrontendState
                  | undefined;
                if (catalogRow === undefined) {
                  if (props.authority !== 'online') {
                    throw new ZerospinError({
                      code: 'cached-service-frontend-replica-create-forbidden',
                      message:
                        'Cached-offline authority cannot create a replica',
                    });
                  }
                  commissioningFrontendState = await runtime.runPromise(
                    decodeRpc(await props.provider.getFrontendState()),
                  );
                  if (
                    commissioningFrontendState.systemId !== systemId ||
                    commissioningFrontendState.generationId !== generationId ||
                    commissioningFrontendState.serviceName !==
                      props.serviceName ||
                    commissioningFrontendState.actorId !== props.actorId ||
                    commissioningFrontendState.actorName !== props.actorName ||
                    commissioningFrontendState.frontendName !==
                      props.frontendName
                  ) {
                    throw new ZerospinError({
                      code: 'service-frontend-replica-state-target-mismatch',
                      message:
                        'Authoritative service state does not match acquisition target',
                    });
                  }
                }

                if (catalogRow === undefined) {
                  if (commissioningFrontendState === undefined) {
                    throw new ZerospinError({
                      code: 'service-frontend-replica-state-missing',
                      message:
                        'Online service commission requires authoritative state',
                    });
                  }
                  for (const interruptedRow of matchingRows.filter(
                    row => row.status === 'commissioning',
                  )) {
                    const failure = new ZerospinError({
                      code: 'interrupted-service-frontend-commission',
                      message:
                        'Interrupted service commission is preserved and rebuilt online',
                    });
                    await partitionStore.db
                      .update(serviceFrontendReplicas)
                      .set({
                        status: 'failed',
                        lastFailure: ZerospinError.stringify(failure),
                        updatedAt: new Date(),
                      })
                      .where(eq(serviceFrontendReplicas.id, interruptedRow.id))
                      .run();
                  }
                  const replicaId = await runtime.runPromise(
                    makeIdFromAbbreviation({ abbreviation: 'sfrp' }),
                  );
                  const now = new Date();
                  await partitionStore.db
                    .insert(serviceFrontendReplicas)
                    .values({
                      id: replicaId,
                      serviceName: props.serviceName,
                      actorId: props.actorId,
                      actorName: props.actorName,
                      frontendName: props.frontendName,
                      frontendVersion: props.frontendVersion,
                      frontendSpecHash: props.frontendSpecHash,
                      frontendSpec: Schema.encodeUnknownSync(
                        Schema.parseJson(),
                      )(props.frontendSpec),
                      databaseName: replicaDatabaseName,
                      previousDatabaseNames: Schema.encodeUnknownSync(
                        Schema.parseJson(Schema.Array(Schema.String)),
                      )(
                        matchingRows.map(
                          row => `${row.id}/${row.databaseName}`,
                        ),
                      ),
                      status: 'commissioning',
                      role: props.role,
                      replicaIndex: 0,
                      frontendIndex: commissioningFrontendState.frontendIndex,
                      systemVersion: commissioningFrontendState.systemVersion,
                      systemWorkerName:
                        commissioningFrontendState.systemWorkerName,
                      pendingTransition: null,
                      socketState: 'disconnected',
                      reconnectAttempt: 0,
                      lastFailure: null,
                      createdAt: now,
                      updatedAt: now,
                    })
                    .run();
                  catalogRow = (
                    await partitionStore.db
                      .select()
                      .from(serviceFrontendReplicas)
                      .where(eq(serviceFrontendReplicas.id, replicaId))
                      .all()
                  )[0];
                  if (catalogRow === undefined) {
                    throw new ZerospinError({
                      code: 'service-frontend-replica-catalog-insert-missing',
                      message:
                        'Inserted service frontend replica row was not found',
                    });
                  }
                }

                const runtimeKey = `${this.props.partitionKey}/service/${catalogRow.id}`;
                let replicaRuntime = serviceReplicaRuntimes.get(runtimeKey);
                if (replicaRuntime === undefined) {
                  const resourceSchemas: IAnyDrizzleSchemas = {};
                  for (const [modelName, modelSpec] of Object.entries(
                    props.frontendSpec.models,
                  )) {
                    const decodedIndexes: Array<{
                      name: string;
                      columns: [string, ...string[]];
                      unique?: boolean;
                    }> = [];
                    for (const indexSpec of modelSpec.indexes) {
                      const [firstColumn, ...otherColumns] = indexSpec.columns;
                      if (firstColumn === undefined) {
                        throw new ZerospinError({
                          code: 'service-frontend-replica-index-empty',
                          message: `Service frontend model "${modelName}" contains an empty index`,
                        });
                      }
                      decodedIndexes.push({
                        name: indexSpec.name,
                        columns: [firstColumn, ...otherColumns],
                        ...(indexSpec.unique === undefined
                          ? {}
                          : { unique: indexSpec.unique }),
                      });
                    }
                    resourceSchemas[modelName] =
                      makeDrizzleSchemaFromEncodedTable({
                        name: modelSpec.modelName,
                        shape: Schema.decodeUnknownSync(encodedShapeSchema)(
                          modelSpec.properties,
                        ),
                        indexes: decodedIndexes,
                      });
                  }
                  const completeReplicaDbConfig = {
                    schema: {
                      ...resourceSchemas,
                      ...serviceReplicaDbConfig.schema,
                    },
                    relations: serviceReplicaDbConfig.relations,
                  };
                  const replicaSqlite = await makeIdbSQLite3({
                    databaseName: catalogRow.databaseName,
                    vfsName: `${partitionStore.vfsName}/service/${catalogRow.id}`,
                    wasmUrl: sharedWorkerWasmUrl,
                  });
                  const db = makeAsyncWaSqliteDrizzle(
                    replicaSqlite,
                    completeReplicaDbConfig,
                  );
                  await runtime.runPromise(
                    migrateDbAsync({
                      db,
                      schema: completeReplicaDbConfig.schema,
                    }),
                  );
                  if (catalogRow.pendingTransition !== null) {
                    try {
                      const pendingTransition = Schema.decodeUnknownSync(
                        Schema.parseJson(
                          ServiceFrontendLineageTransitionRequiredSchema,
                        ),
                      )(catalogRow.pendingTransition, {
                        onExcessProperty: 'error',
                      });
                      const transitionStateRow = await db
                        .select()
                        .from(serviceReplicaState)
                        .where(eq(serviceReplicaState.id, 'srps_current'))
                        .get();
                      const transitionState =
                        transitionStateRow === undefined
                          ? null
                          : Schema.decodeUnknownSync(
                              Schema.parseJson(
                                ServiceFrontendReplicaStateSchema,
                              ),
                            )(transitionStateRow.state, {
                              onExcessProperty: 'error',
                            });
                      const appliedTransitionBlock =
                        transitionStateRow?.previousBlock === null ||
                        transitionStateRow?.previousBlock === undefined
                          ? null
                          : Schema.decodeUnknownSync(
                              Schema.parseJson(
                                ServiceFrontendReplicaBlockSchema,
                              ),
                            )(transitionStateRow.previousBlock, {
                              onExcessProperty: 'error',
                            });
                      if (
                        transitionState === null ||
                        pendingTransition.systemId !== systemId ||
                        pendingTransition.serviceName !==
                          catalogRow.serviceName ||
                        pendingTransition.actorId !== catalogRow.actorId ||
                        pendingTransition.actorName !== catalogRow.actorName ||
                        pendingTransition.frontendName !==
                          catalogRow.frontendName ||
                        pendingTransition.appliedBoundaryIndex !==
                          catalogRow.frontendIndex ||
                        transitionState.systemId !== systemId ||
                        transitionState.generationId !== generationId ||
                        transitionState.serviceName !==
                          catalogRow.serviceName ||
                        transitionState.actorId !== catalogRow.actorId ||
                        transitionState.actorName !== catalogRow.actorName ||
                        transitionState.frontendName !==
                          catalogRow.frontendName ||
                        transitionState.frontendVersion !==
                          catalogRow.frontendVersion ||
                        transitionState.replicaIndex !==
                          catalogRow.replicaIndex ||
                        transitionState.frontendIndex !==
                          catalogRow.frontendIndex ||
                        appliedTransitionBlock === null ||
                        appliedTransitionBlock.systemId !== systemId ||
                        appliedTransitionBlock.generationId !== generationId ||
                        appliedTransitionBlock.serviceName !==
                          catalogRow.serviceName ||
                        appliedTransitionBlock.actorId !== catalogRow.actorId ||
                        appliedTransitionBlock.actorName !==
                          catalogRow.actorName ||
                        appliedTransitionBlock.frontendName !==
                          catalogRow.frontendName ||
                        appliedTransitionBlock.frontendVersion !==
                          catalogRow.frontendVersion ||
                        appliedTransitionBlock.replicaIndex !==
                          catalogRow.replicaIndex ||
                        appliedTransitionBlock.frontendIndex !==
                          pendingTransition.appliedBoundaryIndex ||
                        appliedTransitionBlock.lineageBlock.kind !==
                          'generation-boundary' ||
                        appliedTransitionBlock.lineageBlock.systemId !==
                          systemId ||
                        appliedTransitionBlock.lineageBlock.prevGenerationId !==
                          generationId ||
                        appliedTransitionBlock.lineageBlock.generationId ===
                          generationId ||
                        appliedTransitionBlock.lineageBlock.serviceName !==
                          catalogRow.serviceName ||
                        appliedTransitionBlock.lineageBlock.actorId !==
                          catalogRow.actorId ||
                        appliedTransitionBlock.lineageBlock.actorName !==
                          catalogRow.actorName ||
                        appliedTransitionBlock.lineageBlock.frontendName !==
                          catalogRow.frontendName ||
                        appliedTransitionBlock.lineageBlock.frontendIndex !==
                          pendingTransition.appliedBoundaryIndex
                      ) {
                        throw new ZerospinError({
                          code: 'service-frontend-persisted-transition-boundary-unproven',
                          message:
                            'Persisted service transition does not match the applied generation boundary',
                        });
                      }
                      let previousBoundaryGenerationId =
                        appliedTransitionBlock.lineageBlock.generationId;
                      let previousBoundaryIndex =
                        appliedTransitionBlock.lineageBlock.frontendIndex;
                      const visitedBoundaryGenerationIds = new Set<string>([
                        generationId,
                        previousBoundaryGenerationId,
                      ]);
                      for (const remainingBoundary of pendingTransition.remainingBoundaries) {
                        if (
                          remainingBoundary.systemId !== systemId ||
                          remainingBoundary.prevGenerationId !==
                            previousBoundaryGenerationId ||
                          remainingBoundary.generationId ===
                            previousBoundaryGenerationId ||
                          visitedBoundaryGenerationIds.has(
                            remainingBoundary.generationId,
                          ) ||
                          remainingBoundary.serviceName !==
                            catalogRow.serviceName ||
                          remainingBoundary.actorId !== catalogRow.actorId ||
                          remainingBoundary.actorName !==
                            catalogRow.actorName ||
                          remainingBoundary.frontendName !==
                            catalogRow.frontendName ||
                          remainingBoundary.frontendIndex <=
                            previousBoundaryIndex
                        ) {
                          throw new ZerospinError({
                            code: 'service-frontend-persisted-transition-boundary-chain-invalid',
                            message:
                              'Persisted service transition descriptors are not one ordered canonical lineage',
                          });
                        }
                        previousBoundaryGenerationId =
                          remainingBoundary.generationId;
                        previousBoundaryIndex = remainingBoundary.frontendIndex;
                        visitedBoundaryGenerationIds.add(
                          remainingBoundary.generationId,
                        );
                      }
                      if (
                        previousBoundaryGenerationId !==
                        pendingTransition.generationId
                      ) {
                        throw new ZerospinError({
                          code: 'service-frontend-persisted-transition-boundary-target-mismatch',
                          message:
                            'Persisted service transition descriptors do not reach their target generation',
                        });
                      }
                    } catch (cause) {
                      const failure = new ZerospinError({
                        code: 'service-frontend-persisted-transition-unproven',
                        message:
                          'The service replica contains an unproven persisted lineage transition',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      });
                      await partitionStore.db
                        .update(serviceFrontendReplicas)
                        .set({
                          status: 'failed',
                          lastFailure: ZerospinError.stringify(failure),
                          updatedAt: new Date(),
                        })
                        .where(eq(serviceFrontendReplicas.id, catalogRow.id))
                        .run();
                      catalogRow.status = 'failed';
                      catalogRow.lastFailure = ZerospinError.stringify(failure);
                      throw failure;
                    }
                  }
                  replicaRuntime = new ServiceReplicaRuntime(
                    catalogRow,
                    partitionStore,
                    db,
                    resourceSchemas,
                  );
                  serviceReplicaRuntimes.set(runtimeKey, replicaRuntime);
                }

                if (catalogRow.status !== 'ready') {
                  if (commissioningFrontendState === undefined) {
                    commissioningFrontendState = await runtime.runPromise(
                      decodeRpc(await props.provider.getFrontendState()),
                    );
                  }
                  const frontendState = commissioningFrontendState;
                  await replicaRuntime.serialize(() =>
                    replicaRuntime.replaceFromServer(frontendState),
                  );
                } else {
                  try {
                    await replicaRuntime.getSnapshot();
                  } catch (physicalCause) {
                    const physicalFailure = new ZerospinError({
                      code: 'service-frontend-replica-physical-corruption',
                      message:
                        'The service frontend materialization could not be read',
                      cause: ZerospinError.prettyUnknownFailure(physicalCause),
                    });
                    if (props.authority !== 'online') {
                      await partitionStore.db
                        .update(serviceFrontendReplicas)
                        .set({
                          lastFailure: ZerospinError.stringify(physicalFailure),
                          updatedAt: new Date(),
                        })
                        .where(eq(serviceFrontendReplicas.id, catalogRow.id))
                        .run();
                      catalogRow.lastFailure =
                        ZerospinError.stringify(physicalFailure);
                      throw physicalFailure;
                    }

                    const rebuildingFrontendState = await runtime.runPromise(
                      decodeRpc(await props.provider.getFrontendState()),
                    );
                    const replacement = await replicaRuntime.serialize(() =>
                      replicaRuntime.replaceFromServer(rebuildingFrontendState),
                    );
                    await replicaRuntime.serialize(() =>
                      replicaRuntime.fanoutReplacement(replacement),
                    );
                  }
                }

                const registrationId = await replicaRuntime.serialize(() =>
                  replicaRuntime.acquire({
                    provider: props.provider,
                    authority: props.authority,
                    role: props.role,
                    ownerToken: this.props.ownerToken,
                  }),
                );
                const acquiredRuntime = replicaRuntime;
                return new (class extends RpcTarget {
                  async getFrontendState() {
                    return runtime.runPromise(
                      Effect.tryPromise({
                        try: () =>
                          acquiredRuntime.getAcquiredState(registrationId),
                        catch: cause =>
                          ZerospinError.isZerospinError(cause)
                            ? cause
                            : new ZerospinError({
                                code: 'read-service-frontend-replica-failed',
                                message:
                                  'Failed to read service frontend replica',
                                cause:
                                  ZerospinError.prettyUnknownFailure(cause),
                              }),
                      }).pipe(encodeRpc),
                    );
                  }

                  async release() {
                    return runtime.runPromise(
                      Effect.tryPromise({
                        try: () => acquiredRuntime.release(registrationId),
                        catch: cause =>
                          ZerospinError.isZerospinError(cause)
                            ? cause
                            : new ZerospinError({
                                code: 'release-service-frontend-replica-failed',
                                message:
                                  'Failed to release service frontend replica',
                                cause:
                                  ZerospinError.prettyUnknownFailure(cause),
                              }),
                      }).pipe(encodeRpc),
                    );
                  }
                })();
              },
            );
            partitionStore.acquisitionTail = resultPromise.then(
              () => undefined,
              () => undefined,
            );
            return resultPromise;
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'acquire-service-frontend-replica-failed',
                  message: 'Failed to acquire service frontend replica',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async stageFrontendCommand(
      props: Parameters<IPartitionApi['stageFrontendCommand']>[0],
    ): ReturnType<IPartitionApi['stageFrontendCommand']> {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            const rows = await partitionStore.db
              .select()
              .from(accountFrontendReplicas)
              .where(
                and(
                  eq(accountFrontendReplicas.accountId, props.target.accountId),
                  eq(
                    accountFrontendReplicas.accountName,
                    props.target.accountName,
                  ),
                  eq(accountFrontendReplicas.actorId, props.target.actorId),
                  eq(accountFrontendReplicas.actorName, props.target.actorName),
                  eq(
                    accountFrontendReplicas.frontendName,
                    props.target.frontendName,
                  ),
                  eq(
                    accountFrontendReplicas.frontendVersion,
                    props.target.frontendVersion,
                  ),
                  eq(accountFrontendReplicas.status, 'ready'),
                ),
              )
              .orderBy(desc(accountFrontendReplicas.createdAt))
              .all();
            const row = rows[0];
            if (row === undefined) {
              throw new ZerospinError({
                code: 'account-frontend-replica-not-acquired',
                message:
                  'No ready account frontend replica matches the stage target',
              });
            }
            const replicaRuntime = accountReplicaRuntimes.get(
              `${this.props.partitionKey}/account/${row.id}`,
            );
            if (replicaRuntime === undefined) {
              throw new ZerospinError({
                code: 'account-frontend-replica-runtime-missing',
                message:
                  'Account frontend replica must be acquired before staging',
              });
            }
            return replicaRuntime.stage({
              ownerToken: this.props.ownerToken,
              baseReplicaIndex: props.baseReplicaIndex,
              command: props.command,
              mutations: props.mutations,
            });
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'stage-frontend-command-in-worker-failed',
                  message:
                    'Failed to durably stage frontend command in SharedWorker',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async getDormantFrontendCommands(
      props: Parameters<IPartitionApi['getDormantFrontendCommands']>[0],
    ): ReturnType<IPartitionApi['getDormantFrontendCommands']> {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            if (props.sourceTarget.generationId !== generationId) {
              throw new ZerospinError({
                code: 'frontend-journal-source-generation-mismatch',
                message:
                  'Source journal locator does not match the bound generation',
              });
            }
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            const rows = await partitionStore.db
              .select()
              .from(accountFrontendCommandJournal)
              .where(
                and(
                  eq(
                    accountFrontendCommandJournal.sourceGenerationId,
                    props.sourceTarget.generationId,
                  ),
                  eq(
                    accountFrontendCommandJournal.accountId,
                    props.sourceTarget.accountId,
                  ),
                  eq(
                    accountFrontendCommandJournal.accountName,
                    props.sourceTarget.accountName,
                  ),
                  eq(
                    accountFrontendCommandJournal.actorId,
                    props.sourceTarget.actorId,
                  ),
                  eq(
                    accountFrontendCommandJournal.actorName,
                    props.sourceTarget.actorName,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendName,
                    props.sourceTarget.frontendName,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendVersion,
                    props.sourceTarget.frontendVersion,
                  ),
                  eq(accountFrontendCommandJournal.journalKind, 'source'),
                ),
              )
              .orderBy(asc(accountFrontendCommandJournal.stagedCursor))
              .all();
            const result: Array<{
              command: IEncodedCommand<IStagedCommand>;
              mutations: readonly IEncodedFrontendMutation[];
            }> = [];
            for (const row of rows) {
              if (row.lifecycle !== 'staged' && row.lifecycle !== 'dormant') {
                continue;
              }
              if (
                row.targetFrontendVersion !== null &&
                row.targetFrontendVersion !== props.targetFrontendVersion
              ) {
                throw new ZerospinError({
                  code: 'frontend-journal-target-version-conflict',
                  message:
                    'Dormant command already targets another frontend version',
                });
              }
              result.push({
                command: Schema.decodeUnknownSync(StagedCommandSchema)(
                  Schema.decodeUnknownSync(Schema.parseJson())(row.command),
                ),
                mutations: Schema.decodeUnknownSync(
                  Schema.parseJson(Schema.Array(EncodedFrontendMutationSchema)),
                )(row.mutations),
              });
            }
            return result;
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'read-dormant-frontend-commands-failed',
                  message: 'Failed to read dormant frontend commands',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async importAdaptedFrontendCommands(
      props: Parameters<IPartitionApi['importAdaptedFrontendCommands']>[0],
    ): ReturnType<IPartitionApi['importAdaptedFrontendCommands']> {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            const catalogRow = await partitionStore.db
              .select()
              .from(accountFrontendReplicas)
              .where(
                and(
                  eq(accountFrontendReplicas.accountId, props.target.accountId),
                  eq(
                    accountFrontendReplicas.accountName,
                    props.target.accountName,
                  ),
                  eq(accountFrontendReplicas.actorId, props.target.actorId),
                  eq(accountFrontendReplicas.actorName, props.target.actorName),
                  eq(
                    accountFrontendReplicas.frontendName,
                    props.target.frontendName,
                  ),
                  eq(
                    accountFrontendReplicas.frontendVersion,
                    props.target.frontendVersion,
                  ),
                  eq(accountFrontendReplicas.status, 'ready'),
                ),
              )
              .get();
            if (catalogRow === undefined) {
              throw new ZerospinError({
                code: 'adapted-command-target-replica-missing',
                message: 'Adapted command target replica is missing',
              });
            }
            const replicaRuntime = accountReplicaRuntimes.get(
              `${this.props.partitionKey}/account/${catalogRow.id}`,
            );
            if (replicaRuntime === undefined) {
              throw new ZerospinError({
                code: 'adapted-command-target-runtime-missing',
                message:
                  'Adapted command target must remain acquired while commissioning',
              });
            }
            if (
              props.sourceTarget.accountId !== props.target.accountId ||
              props.sourceTarget.accountName !== props.target.accountName ||
              props.sourceTarget.actorId !== props.target.actorId ||
              props.sourceTarget.actorName !== props.target.actorName ||
              props.sourceTarget.frontendName !== props.target.frontendName
            ) {
              throw new ZerospinError({
                code: 'adapted-command-lineage-identity-mismatch',
                message:
                  'Source and target command locators must preserve account and actor identity',
              });
            }
            const sourceGenerationId = Schema.decodeUnknownSync(
              makeAbbreviationIdSchema(coreAbbreviations.generation),
            )(props.sourceTarget.generationId);
            const persistedSourceTargets = Schema.decodeUnknownSync(
              Schema.parseJson(accountFrontendSourceTargetsSchema),
            )(catalogRow.sourceTargets, { onExcessProperty: 'error' });
            let exactSourceTargetIsPersisted = false;
            for (const sourceTarget of persistedSourceTargets) {
              if (
                sourceTarget.generationId === sourceGenerationId &&
                sourceTarget.accountId === props.sourceTarget.accountId &&
                sourceTarget.accountName === props.sourceTarget.accountName &&
                sourceTarget.actorId === props.sourceTarget.actorId &&
                sourceTarget.actorName === props.sourceTarget.actorName &&
                sourceTarget.frontendName ===
                  props.sourceTarget.frontendName &&
                sourceTarget.frontendVersion ===
                  props.sourceTarget.frontendVersion
              ) {
                exactSourceTargetIsPersisted = true;
              }
            }
            if (!exactSourceTargetIsPersisted && props.commands.length > 0) {
              throw new ZerospinError({
                code: 'adapted-command-source-lineage-unproven',
                message:
                  'The target replica has not recorded the exact predecessor journal locator',
              });
            }
            if (sourceGenerationId === generationId) {
              const sourceCatalogRow = await partitionStore.db
                .select()
                .from(accountFrontendReplicas)
                .where(
                  and(
                    eq(
                      accountFrontendReplicas.accountId,
                      props.sourceTarget.accountId,
                    ),
                    eq(
                      accountFrontendReplicas.accountName,
                      props.sourceTarget.accountName,
                    ),
                    eq(
                      accountFrontendReplicas.actorId,
                      props.sourceTarget.actorId,
                    ),
                    eq(
                      accountFrontendReplicas.actorName,
                      props.sourceTarget.actorName,
                    ),
                    eq(
                      accountFrontendReplicas.frontendName,
                      props.sourceTarget.frontendName,
                    ),
                    eq(
                      accountFrontendReplicas.frontendVersion,
                      props.sourceTarget.frontendVersion,
                    ),
                    eq(accountFrontendReplicas.status, 'ready'),
                  ),
                )
                .get();
              if (sourceCatalogRow === undefined) {
                throw new ZerospinError({
                  code: 'adapted-command-source-replica-missing',
                  message:
                    'Same-generation adapted command source replica is missing',
                });
              }
              const sourceFrontendSpec = Schema.decodeUnknownSync(
                Schema.parseJson(
                  Schema.Struct({
                    modelNames: Schema.Array(Schema.String),
                    models: Schema.Record({
                      key: Schema.String,
                      value: Schema.Unknown,
                    }),
                  }),
                ),
              )(sourceCatalogRow.frontendSpec);
              const targetFrontendSpec = Schema.decodeUnknownSync(
                Schema.parseJson(
                  Schema.Struct({
                    modelNames: Schema.Array(Schema.String),
                    models: Schema.Record({
                      key: Schema.String,
                      value: Schema.Unknown,
                    }),
                  }),
                ),
              )(catalogRow.frontendSpec);
              if (
                JSON.stringify(sourceFrontendSpec.modelNames) !==
                  JSON.stringify(targetFrontendSpec.modelNames) ||
                JSON.stringify(sourceFrontendSpec.models) !==
                  JSON.stringify(targetFrontendSpec.models)
              ) {
                throw new ZerospinError({
                  code: 'adapted-command-source-projection-schema-mismatch',
                  message:
                    'Same-generation adapted command import requires identical projection schemas',
                });
              }
            }
            if (props.commands.length === 0) {
              if (!exactSourceTargetIsPersisted) {
                const encodedSourceTargets = Schema.encodeUnknownSync(
                  Schema.parseJson(accountFrontendSourceTargetsSchema),
                )([
                  ...persistedSourceTargets,
                  {
                    generationId: sourceGenerationId,
                    accountId: props.sourceTarget.accountId,
                    accountName: props.sourceTarget.accountName,
                    actorId: props.sourceTarget.actorId,
                    actorName: props.sourceTarget.actorName,
                    frontendName: props.sourceTarget.frontendName,
                    frontendVersion: props.sourceTarget.frontendVersion,
                  },
                ]);
                await partitionStore.db
                  .update(accountFrontendReplicas)
                  .set({
                    sourceTargets: encodedSourceTargets,
                    updatedAt: new Date(),
                  })
                  .where(eq(accountFrontendReplicas.id, catalogRow.id))
                  .run();
                catalogRow.sourceTargets = encodedSourceTargets;
                replicaRuntime.catalogRow.sourceTargets = encodedSourceTargets;
              }
              const state = await replicaRuntime.getSnapshot();
              return { commandIds: [], replicaIndex: state.replicaIndex };
            }

            const commandIds: IEncodedCommand<IStagedCommand>['id'][] = [];
            const decodedEntries: Array<{
              sourceCommand: IEncodedCommand<IStagedCommand>;
              adaptedCommand: IEncodedCommand<IStagedCommand>;
              mutations: readonly IEncodedFrontendMutation[];
              journalId: (typeof accountFrontendCommandJournal.$inferInsert)['id'];
            }> = [];
            for (const entry of props.commands) {
              const sourceCommand = Schema.validateSync(StagedCommandSchema)(
                entry.sourceCommand,
              );
              const adaptedCommand = Schema.validateSync(StagedCommandSchema)(
                entry.adaptedCommand,
              );
              const mutations = Schema.decodeUnknownSync(
                Schema.Array(EncodedFrontendMutationSchema),
              )(entry.mutations);
              if (sourceCommand.id !== adaptedCommand.id) {
                throw new ZerospinError({
                  code: 'adapted-command-id-mismatch',
                  message:
                    'Source and adapted commands must preserve the same command ID',
                });
              }
              if (commandIds.includes(adaptedCommand.id)) {
                throw new ZerospinError({
                  code: 'adapted-command-id-duplicate',
                  message:
                    'An adapted-command import cannot repeat a command ID',
                });
              }
              if (
                sourceCommand.accountId !== props.sourceTarget.accountId ||
                sourceCommand.accountName !== props.sourceTarget.accountName ||
                sourceCommand.actorId !== props.sourceTarget.actorId ||
                sourceCommand.actorName !== props.sourceTarget.actorName ||
                sourceCommand.frontendName !==
                  props.sourceTarget.frontendName ||
                adaptedCommand.accountId !== props.target.accountId ||
                adaptedCommand.accountName !== props.target.accountName ||
                adaptedCommand.actorId !== props.target.actorId ||
                adaptedCommand.actorName !== props.target.actorName ||
                adaptedCommand.frontendName !== props.target.frontendName
              ) {
                throw new ZerospinError({
                  code: 'adapted-command-target-mismatch',
                  message:
                    'Source or adapted command does not match its complete locator',
                });
              }
              for (const [mutationIndex, mutation] of mutations.entries()) {
                if (
                  mutation.commandId !== adaptedCommand.id ||
                  mutation.mutationIndex !== mutationIndex
                ) {
                  throw new ZerospinError({
                    code: 'adapted-command-mutation-sequence-invalid',
                    message:
                      'Adapted mutations must preserve command ID and contiguous order',
                  });
                }
              }
              commandIds.push(adaptedCommand.id);
              decodedEntries.push({
                sourceCommand,
                adaptedCommand,
                mutations,
                journalId: await runtime.runPromise(
                  makeIdFromAbbreviation({ abbreviation: 'afcj' }),
                ),
              });
            }

            return replicaRuntime.serialize(async () => {
              const current = await replicaRuntime.getSnapshot();
              const existingRows = await partitionStore.db
                .select()
                .from(accountFrontendCommandJournal)
                .where(
                  and(
                    eq(
                      accountFrontendCommandJournal.accountId,
                      props.sourceTarget.accountId,
                    ),
                    eq(
                      accountFrontendCommandJournal.accountName,
                      props.sourceTarget.accountName,
                    ),
                    eq(
                      accountFrontendCommandJournal.actorId,
                      props.sourceTarget.actorId,
                    ),
                    eq(
                      accountFrontendCommandJournal.actorName,
                      props.sourceTarget.actorName,
                    ),
                    eq(
                      accountFrontendCommandJournal.frontendName,
                      props.sourceTarget.frontendName,
                    ),
                    eq(
                      accountFrontendCommandJournal.frontendVersion,
                      props.sourceTarget.frontendVersion,
                    ),
                    eq(
                      accountFrontendCommandJournal.sourceGenerationId,
                      sourceGenerationId,
                    ),
                    eq(accountFrontendCommandJournal.journalKind, 'adapted'),
                    inArray(
                      accountFrontendCommandJournal.commandId,
                      commandIds,
                    ),
                  ),
                )
                .all();
              for (const entry of decodedEntries) {
                const existing = existingRows.find(
                  row => row.commandId === entry.adaptedCommand.id,
                );
                if (
                  existing !== undefined &&
                  (existing.command !==
                    Schema.encodeUnknownSync(
                      Schema.parseJson(StagedCommandSchema),
                    )(entry.adaptedCommand) ||
                    existing.sourceCommand !==
                      Schema.encodeUnknownSync(
                        Schema.parseJson(StagedCommandSchema),
                      )(entry.sourceCommand) ||
                    existing.mutations !==
                      Schema.encodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedFrontendMutationSchema),
                        ),
                      )(entry.mutations) ||
                    existing.targetGenerationId !== generationId ||
                    existing.targetFrontendVersion !==
                      props.target.frontendVersion)
                ) {
                  throw new ZerospinError({
                    code: 'adapted-command-journal-conflict',
                    message:
                      'An imported command ID already has different source or adapted bytes',
                  });
                }
              }

              const alreadyMaterialized = decodedEntries.filter(entry =>
                current.stagedCommands.some(
                  command => command.id === entry.adaptedCommand.id,
                ),
              );
              const entriesToMaterialize = decodedEntries.filter(
                entry =>
                  !alreadyMaterialized.some(
                    materialized =>
                      materialized.adaptedCommand.id ===
                      entry.adaptedCommand.id,
                  ),
              );
              if (
                props.baseReplicaIndex !== current.replicaIndex &&
                entriesToMaterialize.length > 0
              ) {
                throw new ZerospinError({
                  code: 'adapted-command-base-index-stale',
                  message:
                    'Adapted commands were prepared against a stale target replica index',
                });
              }

              await runtime.runPromise(
                makeTxAsync({
                  db: partitionStore.db,
                  program: ({ tx }) =>
                    Effect.tryPromise({
                      try: async () => {
                        for (const entry of decodedEntries) {
                          if (
                            existingRows.some(
                              row => row.commandId === entry.adaptedCommand.id,
                            )
                          ) {
                            continue;
                          }
                          const now = new Date();
                          await tx
                            .insert(accountFrontendCommandJournal)
                            .values({
                              id: entry.journalId,
                              commandId: entry.adaptedCommand.id,
                              sourceGenerationId,
                              accountId: props.sourceTarget.accountId,
                              accountName: props.sourceTarget.accountName,
                              actorId: props.sourceTarget.actorId,
                              actorName: props.sourceTarget.actorName,
                              frontendName: props.sourceTarget.frontendName,
                              frontendVersion:
                                props.sourceTarget.frontendVersion,
                              journalKind: 'adapted',
                              command: Schema.encodeUnknownSync(
                                Schema.parseJson(StagedCommandSchema),
                              )(entry.adaptedCommand),
                              sourceCommand: Schema.encodeUnknownSync(
                                Schema.parseJson(StagedCommandSchema),
                              )(entry.sourceCommand),
                              mutations: Schema.encodeUnknownSync(
                                Schema.parseJson(
                                  Schema.Array(EncodedFrontendMutationSchema),
                                ),
                              )(entry.mutations),
                              appliedMutations: Schema.encodeUnknownSync(
                                Schema.parseJson(
                                  Schema.Array(EncodedAppliedMutationSchema),
                                ),
                              )([]),
                              stagedCursor: entry.adaptedCommand.stagedCursor,
                              stagedAt: entry.adaptedCommand.stagedAt.getTime(),
                              originalContractVersion:
                                entry.sourceCommand.version,
                              originalPayload: entry.sourceCommand.payload,
                              lifecycle: 'staged',
                              pushProvenance: null,
                              terminalOutcome: null,
                              targetGenerationId: generationId,
                              targetFrontendVersion:
                                props.target.frontendVersion,
                              materializedReplicaIndex: null,
                              createdAt: now,
                              updatedAt: now,
                            })
                            .run();
                        }
                      },
                      catch: ZerospinError.catch({
                        code: 'commit-adapted-command-journal-failed',
                        message:
                          'Failed to commit adapted commands before materialization',
                      }),
                    }).pipe(Effect.withSpan('commitAdaptedCommandJournal')),
                }),
              );
              if (entriesToMaterialize.length === 0) {
                for (const entry of alreadyMaterialized) {
                  const optimistic = current.optimisticAppliedMutations.find(
                    row => row.commandId === entry.adaptedCommand.id,
                  );
                  if (optimistic === undefined) {
                    throw new ZerospinError({
                      code: 'adapted-command-materialization-receipt-missing',
                      message:
                        'Adapted command exists without its applied mutation receipt',
                    });
                  }
                  const existingJournalRow = existingRows.find(
                    row => row.commandId === entry.adaptedCommand.id,
                  );
                  await partitionStore.db
                    .update(accountFrontendCommandJournal)
                    .set({
                      appliedMutations: Schema.encodeUnknownSync(
                        Schema.parseJson(
                          Schema.Array(EncodedAppliedMutationSchema),
                        ),
                      )(optimistic.mutations),
                      materializedReplicaIndex: current.replicaIndex,
                      updatedAt: new Date(),
                    })
                    .where(
                      eq(
                        accountFrontendCommandJournal.id,
                        existingJournalRow?.id ?? entry.journalId,
                      ),
                    )
                    .run();
                }
                return { commandIds, replicaIndex: current.replicaIndex };
              }

              const replicaIndex = current.replicaIndex + 1;
              const receipts: Array<{
                journalId: (typeof accountFrontendCommandJournal.$inferSelect)['id'];
                commandId: IEncodedCommand<IStagedCommand>['id'];
                mutations: readonly IEncodedAppliedMutation[];
              }> = [];
              const committed = await runtime.runPromise(
                makeTxAsync({
                  db: replicaRuntime.db,
                  program: ({ tx }) =>
                    Effect.tryPromise({
                      try: async () => {
                        const stagedCommands = [...current.stagedCommands];
                        const optimisticAppliedMutations = [
                          ...current.optimisticAppliedMutations,
                        ];
                        const inserted: IEncodedResourceShape[] = [];
                        const updated: IEncodedResourceShape[] = [];
                        const deleted: Array<{
                          id: string;
                          modelName: string;
                        }> = [];
                        for (const entry of entriesToMaterialize) {
                          const applied =
                            await replicaRuntime.applyEncodedMutations({
                              tx,
                              commandId: entry.adaptedCommand.id,
                              mutations: entry.mutations,
                              appliedAt: entry.adaptedCommand.stagedAt,
                            });
                          stagedCommands.push(entry.adaptedCommand);
                          optimisticAppliedMutations.push({
                            commandId: entry.adaptedCommand.id,
                            mutations: applied.appliedMutations,
                          });
                          receipts.push({
                            journalId:
                              existingRows.find(
                                row =>
                                  row.commandId === entry.adaptedCommand.id,
                              )?.id ?? entry.journalId,
                            commandId: entry.adaptedCommand.id,
                            mutations: applied.appliedMutations,
                          });
                          inserted.push(...applied.delta.inserted);
                          updated.push(...applied.delta.updated);
                          deleted.push(...applied.delta.deleted);
                        }
                        const state: IFrontendReplicaState = {
                          ...current,
                          replicaIndex,
                          resources: await replicaRuntime.collectResources(tx),
                          stagedCommands,
                          optimisticAppliedMutations,
                        };
                        await tx
                          .update(accountReplicaState)
                          .set({
                            state: Schema.encodeUnknownSync(
                              Schema.parseJson(FrontendReplicaStateSchema),
                            )(state),
                          })
                          .where(eq(accountReplicaState.id, 'arps_current'))
                          .run();
                        return {
                          delta: { inserted, updated, deleted },
                          optimisticAppliedMutations,
                        };
                      },
                      catch: cause =>
                        ZerospinError.isZerospinError(cause)
                          ? cause
                          : new ZerospinError({
                              code: 'materialize-adapted-commands-failed',
                              message:
                                'Failed to materialize adapted commands as one replica transaction',
                              cause: ZerospinError.prettyUnknownFailure(cause),
                            }),
                    }).pipe(Effect.withSpan('materializeAdaptedCommands')),
                }),
              );
              await runtime.runPromise(
                makeTxAsync({
                  db: partitionStore.db,
                  program: ({ tx }) =>
                    Effect.tryPromise({
                      try: async () => {
                        for (const receipt of receipts) {
                          await tx
                            .update(accountFrontendCommandJournal)
                            .set({
                              appliedMutations: Schema.encodeUnknownSync(
                                Schema.parseJson(
                                  Schema.Array(EncodedAppliedMutationSchema),
                                ),
                              )(receipt.mutations),
                              materializedReplicaIndex: replicaIndex,
                              updatedAt: new Date(),
                            })
                            .where(
                              eq(
                                accountFrontendCommandJournal.id,
                                receipt.journalId,
                              ),
                            )
                            .run();
                        }
                        await tx
                          .update(accountFrontendReplicas)
                          .set({ replicaIndex, updatedAt: new Date() })
                          .where(eq(accountFrontendReplicas.id, catalogRow.id))
                          .run();
                      },
                      catch: ZerospinError.catch({
                        code: 'commit-adapted-command-receipts-failed',
                        message:
                          'Failed to commit adapted command materialization receipts',
                      }),
                    }).pipe(Effect.withSpan('commitAdaptedCommandReceipts')),
                }),
              );
              replicaRuntime.catalogRow.replicaIndex = replicaIndex;
              const block: IFrontendReplicaBlock = {
                kind: 'local-command',
                systemId: current.systemId,
                generationId: current.generationId,
                accountId: current.accountId,
                accountName: current.accountName,
                actorId: current.actorId,
                actorName: current.actorName,
                frontendName: current.frontendName,
                frontendVersion: current.frontendVersion,
                replicaIndex,
                frontendIndex: current.frontendIndex,
                delta: committed.delta,
                stagedCommandsAdded: entriesToMaterialize.map(
                  entry => entry.adaptedCommand,
                ),
                stagedCommandIdsRemoved: [],
                pushedCommandsAdded: [],
                pushedCommandIdsRemoved: [],
                executedPushedCommandsAdded: [],
                executedPushedCommandIdsRemoved: [],
                failedStagedCommandsAdded: [],
                failedPushedCommandsAdded: [],
                failedCommandIdsRemoved: [],
                optimisticAppliedMutationsAdded: receipts.map(receipt => ({
                  commandId: receipt.commandId,
                  mutations: receipt.mutations,
                })),
                optimisticAppliedMutationCommandIdsRemoved: [],
              };
              await replicaRuntime.fanoutBlock(block);
              if (replicaRuntime.catalogRow.socketState === 'online') {
                setTimeout(() => {
                  void replicaRuntime.serialize(() =>
                    replicaRuntime.pushJournalCommands(),
                  );
                }, 0);
              }
              return { commandIds, replicaIndex };
            });
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'import-adapted-frontend-commands-failed',
                  message: 'Failed to import adapted frontend commands',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async markFrontendCommandsMigrated(
      props: Parameters<IPartitionApi['markFrontendCommandsMigrated']>[0],
    ): ReturnType<IPartitionApi['markFrontendCommandsMigrated']> {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            const sourceGenerationId = generationId;
            const targetGenerationId = Schema.decodeUnknownSync(
              makeAbbreviationIdSchema(coreAbbreviations.generation),
            )(props.target.generationId);
            if (
              props.sourceTarget.accountId !== props.target.accountId ||
              props.sourceTarget.accountName !== props.target.accountName ||
              props.sourceTarget.actorId !== props.target.actorId ||
              props.sourceTarget.actorName !== props.target.actorName ||
              props.sourceTarget.frontendName !== props.target.frontendName
            ) {
              throw new ZerospinError({
                code: 'frontend-journal-migration-target-identity-mismatch',
                message:
                  'Migration target must preserve account and actor identity',
              });
            }
            const sourceCatalogRow = await partitionStore.db
              .select()
              .from(accountFrontendReplicas)
              .where(
                and(
                  eq(
                    accountFrontendReplicas.accountId,
                    props.sourceTarget.accountId,
                  ),
                  eq(
                    accountFrontendReplicas.accountName,
                    props.sourceTarget.accountName,
                  ),
                  eq(
                    accountFrontendReplicas.actorId,
                    props.sourceTarget.actorId,
                  ),
                  eq(
                    accountFrontendReplicas.actorName,
                    props.sourceTarget.actorName,
                  ),
                  eq(
                    accountFrontendReplicas.frontendName,
                    props.sourceTarget.frontendName,
                  ),
                  eq(
                    accountFrontendReplicas.frontendVersion,
                    props.sourceTarget.frontendVersion,
                  ),
                  eq(accountFrontendReplicas.status, 'ready'),
                ),
              )
              .get();
            if (sourceCatalogRow === undefined) {
              throw new ZerospinError({
                code: 'frontend-journal-migration-source-replica-missing',
                message: 'Source command journal locator has no ready replica',
              });
            }
            if (targetGenerationId === sourceGenerationId) {
              const targetCatalogRow = await partitionStore.db
                .select()
                .from(accountFrontendReplicas)
                .where(
                  and(
                    eq(
                      accountFrontendReplicas.accountId,
                      props.target.accountId,
                    ),
                    eq(
                      accountFrontendReplicas.accountName,
                      props.target.accountName,
                    ),
                    eq(accountFrontendReplicas.actorId, props.target.actorId),
                    eq(
                      accountFrontendReplicas.actorName,
                      props.target.actorName,
                    ),
                    eq(
                      accountFrontendReplicas.frontendName,
                      props.target.frontendName,
                    ),
                    eq(
                      accountFrontendReplicas.frontendVersion,
                      props.target.frontendVersion,
                    ),
                    eq(accountFrontendReplicas.status, 'ready'),
                  ),
                )
                .get();
              if (targetCatalogRow === undefined) {
                throw new ZerospinError({
                  code: 'frontend-journal-migration-target-replica-missing',
                  message:
                    'Same-generation command migration target has no ready replica',
                });
              }
              const sourceFrontendSpec = Schema.decodeUnknownSync(
                Schema.parseJson(
                  Schema.Struct({
                    modelNames: Schema.Array(Schema.String),
                    models: Schema.Record({
                      key: Schema.String,
                      value: Schema.Unknown,
                    }),
                  }),
                ),
              )(sourceCatalogRow.frontendSpec);
              const targetFrontendSpec = Schema.decodeUnknownSync(
                Schema.parseJson(
                  Schema.Struct({
                    modelNames: Schema.Array(Schema.String),
                    models: Schema.Record({
                      key: Schema.String,
                      value: Schema.Unknown,
                    }),
                  }),
                ),
              )(targetCatalogRow.frontendSpec);
              if (
                JSON.stringify(sourceFrontendSpec.modelNames) !==
                  JSON.stringify(targetFrontendSpec.modelNames) ||
                JSON.stringify(sourceFrontendSpec.models) !==
                  JSON.stringify(targetFrontendSpec.models)
              ) {
                throw new ZerospinError({
                  code: 'frontend-journal-migration-projection-schema-mismatch',
                  message:
                    'Same-generation command migration requires identical projection schemas',
                });
              }
            } else {
              if (sourceCatalogRow.pendingTransition === null) {
                throw new ZerospinError({
                  code: 'frontend-journal-migration-lineage-pending',
                  message:
                    'Source replica has not received its authoritative transition to the migration target yet',
                });
              }
              const sourceReplicaRuntime = accountReplicaRuntimes.get(
                `${this.props.partitionKey}/account/${sourceCatalogRow.id}`,
              );
              let sourceReplicaDb = sourceReplicaRuntime?.db;
              if (sourceReplicaDb === undefined) {
                const sourceReplicaSqlite = await makeIdbSQLite3({
                  databaseName: sourceCatalogRow.databaseName,
                  vfsName: `${partitionStore.vfsName}/account/${sourceCatalogRow.id}`,
                  wasmUrl: sharedWorkerWasmUrl,
                });
                sourceReplicaDb = makeAsyncWaSqliteDrizzle(
                  sourceReplicaSqlite,
                  accountReplicaDbConfig,
                );
              }
              let pendingTransition: Schema.Schema.Type<
                typeof FrontendLineageTransitionRequiredSchema
              >;
              try {
                pendingTransition = Schema.decodeUnknownSync(
                  Schema.parseJson(FrontendLineageTransitionRequiredSchema),
                )(sourceCatalogRow.pendingTransition, {
                  onExcessProperty: 'error',
                });
              } catch (cause) {
                const failure = new ZerospinError({
                  code: 'frontend-journal-migration-lineage-unproven',
                  message:
                    'Source replica has no exact authoritative transition to the migration target',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                });
                await partitionStore.db
                  .update(accountFrontendReplicas)
                  .set({
                    status: 'failed',
                    lastFailure: ZerospinError.stringify(failure),
                    updatedAt: new Date(),
                  })
                  .where(eq(accountFrontendReplicas.id, sourceCatalogRow.id))
                  .run();
                sourceCatalogRow.status = 'failed';
                sourceCatalogRow.lastFailure = ZerospinError.stringify(failure);
                if (sourceReplicaRuntime !== undefined) {
                  sourceReplicaRuntime.catalogRow.status = 'failed';
                  sourceReplicaRuntime.catalogRow.lastFailure =
                    ZerospinError.stringify(failure);
                }
                throw failure;
              }
              if (
                pendingTransition.systemId !== systemId ||
                pendingTransition.generationId !== targetGenerationId ||
                pendingTransition.accountId !== props.target.accountId ||
                pendingTransition.accountName !== props.target.accountName ||
                pendingTransition.actorId !== props.target.actorId ||
                pendingTransition.actorName !== props.target.actorName ||
                pendingTransition.frontendName !== props.target.frontendName ||
                pendingTransition.frontendVersion !==
                  props.target.frontendVersion
              ) {
                throw new ZerospinError({
                  code: 'frontend-journal-migration-lineage-unproven',
                  message:
                    'Source replica has no exact authoritative transition to the migration target',
                });
              }
              try {
                const transitionStateRow = await sourceReplicaDb
                  .select()
                  .from(accountReplicaState)
                  .where(eq(accountReplicaState.id, 'arps_current'))
                  .get();
                const transitionState =
                  transitionStateRow === undefined
                    ? null
                    : Schema.decodeUnknownSync(
                        Schema.parseJson(FrontendReplicaStateSchema),
                      )(transitionStateRow.state, {
                        onExcessProperty: 'error',
                      });
                const appliedTransitionBlock =
                  transitionStateRow?.previousBlock === null ||
                  transitionStateRow?.previousBlock === undefined
                    ? null
                    : Schema.decodeUnknownSync(
                        Schema.parseJson(FrontendReplicaBlockSchema),
                      )(transitionStateRow.previousBlock, {
                        onExcessProperty: 'error',
                      });
                if (
                  transitionState === null ||
                  pendingTransition.appliedBoundaryIndex !==
                    sourceCatalogRow.frontendIndex ||
                  transitionState.systemId !== systemId ||
                  transitionState.generationId !== sourceGenerationId ||
                  transitionState.accountId !== sourceCatalogRow.accountId ||
                  transitionState.accountName !==
                    sourceCatalogRow.accountName ||
                  transitionState.actorId !== sourceCatalogRow.actorId ||
                  transitionState.actorName !== sourceCatalogRow.actorName ||
                  transitionState.frontendName !==
                    sourceCatalogRow.frontendName ||
                  transitionState.frontendVersion !==
                    sourceCatalogRow.frontendVersion ||
                  transitionState.replicaIndex !==
                    sourceCatalogRow.replicaIndex ||
                  transitionState.frontendIndex !==
                    sourceCatalogRow.frontendIndex ||
                  appliedTransitionBlock?.kind !== 'server' ||
                  appliedTransitionBlock.systemId !== systemId ||
                  appliedTransitionBlock.generationId !== sourceGenerationId ||
                  appliedTransitionBlock.accountId !==
                    sourceCatalogRow.accountId ||
                  appliedTransitionBlock.accountName !==
                    sourceCatalogRow.accountName ||
                  appliedTransitionBlock.actorId !== sourceCatalogRow.actorId ||
                  appliedTransitionBlock.actorName !==
                    sourceCatalogRow.actorName ||
                  appliedTransitionBlock.frontendName !==
                    sourceCatalogRow.frontendName ||
                  appliedTransitionBlock.frontendVersion !==
                    sourceCatalogRow.frontendVersion ||
                  appliedTransitionBlock.replicaIndex !==
                    sourceCatalogRow.replicaIndex ||
                  appliedTransitionBlock.frontendIndex !==
                    pendingTransition.appliedBoundaryIndex ||
                  appliedTransitionBlock.lineageBlock.kind !==
                    'generation-boundary' ||
                  appliedTransitionBlock.lineageBlock.systemId !== systemId ||
                  appliedTransitionBlock.lineageBlock.prevGenerationId !==
                    sourceGenerationId ||
                  appliedTransitionBlock.lineageBlock.generationId ===
                    sourceGenerationId ||
                  appliedTransitionBlock.lineageBlock.accountId !==
                    sourceCatalogRow.accountId ||
                  appliedTransitionBlock.lineageBlock.accountName !==
                    sourceCatalogRow.accountName ||
                  appliedTransitionBlock.lineageBlock.actorId !==
                    sourceCatalogRow.actorId ||
                  appliedTransitionBlock.lineageBlock.actorName !==
                    sourceCatalogRow.actorName ||
                  appliedTransitionBlock.lineageBlock.frontendName !==
                    sourceCatalogRow.frontendName ||
                  appliedTransitionBlock.lineageBlock.frontendIndex !==
                    pendingTransition.appliedBoundaryIndex
                ) {
                  throw new ZerospinError({
                    code: 'frontend-journal-migration-transition-boundary-unproven',
                    message:
                      'Persisted migration transition does not match the applied account generation boundary',
                  });
                }
                let previousBoundaryGenerationId =
                  appliedTransitionBlock.lineageBlock.generationId;
                let previousBoundaryIndex =
                  appliedTransitionBlock.lineageBlock.frontendIndex;
                const visitedBoundaryGenerationIds = new Set<string>([
                  sourceGenerationId,
                  previousBoundaryGenerationId,
                ]);
                for (const remainingBoundary of pendingTransition.remainingBoundaries) {
                  if (
                    remainingBoundary.systemId !== systemId ||
                    remainingBoundary.prevGenerationId !==
                      previousBoundaryGenerationId ||
                    remainingBoundary.generationId ===
                      previousBoundaryGenerationId ||
                    visitedBoundaryGenerationIds.has(
                      remainingBoundary.generationId,
                    ) ||
                    remainingBoundary.accountId !==
                      sourceCatalogRow.accountId ||
                    remainingBoundary.accountName !==
                      sourceCatalogRow.accountName ||
                    remainingBoundary.actorId !== sourceCatalogRow.actorId ||
                    remainingBoundary.actorName !==
                      sourceCatalogRow.actorName ||
                    remainingBoundary.frontendName !==
                      sourceCatalogRow.frontendName ||
                    remainingBoundary.frontendIndex <= previousBoundaryIndex
                  ) {
                    throw new ZerospinError({
                      code: 'frontend-journal-migration-transition-boundary-chain-invalid',
                      message:
                        'Persisted migration transition descriptors are not one ordered canonical lineage',
                    });
                  }
                  previousBoundaryGenerationId = remainingBoundary.generationId;
                  previousBoundaryIndex = remainingBoundary.frontendIndex;
                  visitedBoundaryGenerationIds.add(
                    remainingBoundary.generationId,
                  );
                }
                if (
                  previousBoundaryGenerationId !==
                  pendingTransition.generationId
                ) {
                  throw new ZerospinError({
                    code: 'frontend-journal-migration-transition-boundary-target-mismatch',
                    message:
                      'Persisted migration transition descriptors do not reach their target generation',
                  });
                }
              } catch (cause) {
                const failure = new ZerospinError({
                  code: 'frontend-journal-migration-lineage-unproven',
                  message:
                    'Source replica has no exact authoritative transition to the migration target',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                });
                await partitionStore.db
                  .update(accountFrontendReplicas)
                  .set({
                    status: 'failed',
                    lastFailure: ZerospinError.stringify(failure),
                    updatedAt: new Date(),
                  })
                  .where(eq(accountFrontendReplicas.id, sourceCatalogRow.id))
                  .run();
                sourceCatalogRow.status = 'failed';
                sourceCatalogRow.lastFailure = ZerospinError.stringify(failure);
                if (sourceReplicaRuntime !== undefined) {
                  sourceReplicaRuntime.catalogRow.status = 'failed';
                  sourceReplicaRuntime.catalogRow.lastFailure =
                    ZerospinError.stringify(failure);
                }
                throw failure;
              }
            }
            if (props.commandIds.length === 0) return;
            const commandIds: IEncodedCommand<IStagedCommand>['id'][] = [];
            for (const commandId of props.commandIds) {
              commandIds.push(
                Schema.decodeUnknownSync(
                  makeAbbreviationIdSchema(coreAbbreviations.command),
                )(commandId),
              );
            }
            const rows = await partitionStore.db
              .select()
              .from(accountFrontendCommandJournal)
              .where(
                and(
                  eq(
                    accountFrontendCommandJournal.sourceGenerationId,
                    sourceGenerationId,
                  ),
                  eq(
                    accountFrontendCommandJournal.accountId,
                    props.sourceTarget.accountId,
                  ),
                  eq(
                    accountFrontendCommandJournal.accountName,
                    props.sourceTarget.accountName,
                  ),
                  eq(
                    accountFrontendCommandJournal.actorId,
                    props.sourceTarget.actorId,
                  ),
                  eq(
                    accountFrontendCommandJournal.actorName,
                    props.sourceTarget.actorName,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendName,
                    props.sourceTarget.frontendName,
                  ),
                  eq(
                    accountFrontendCommandJournal.frontendVersion,
                    props.sourceTarget.frontendVersion,
                  ),
                  eq(accountFrontendCommandJournal.journalKind, 'source'),
                  inArray(accountFrontendCommandJournal.commandId, commandIds),
                ),
              )
              .all();
            if (rows.length !== new Set(commandIds).size) {
              throw new ZerospinError({
                code: 'frontend-journal-migration-source-missing',
                message:
                  'One or more source commands are missing from the exact journal locator',
              });
            }
            for (const row of rows) {
              if (
                row.targetGenerationId !== null &&
                (row.targetGenerationId !== targetGenerationId ||
                  row.targetFrontendVersion !== props.target.frontendVersion)
              ) {
                throw new ZerospinError({
                  code: 'frontend-journal-migration-target-conflict',
                  message:
                    'Source command was already migrated to another target',
                });
              }
            }
            await partitionStore.db
              .update(accountFrontendCommandJournal)
              .set({
                lifecycle: 'migrated',
                targetGenerationId,
                targetFrontendVersion: props.target.frontendVersion,
                updatedAt: new Date(),
              })
              .where(
                inArray(
                  accountFrontendCommandJournal.id,
                  rows.map(row => row.id),
                ),
              )
              .run();
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'mark-frontend-commands-migrated-failed',
                  message: 'Failed to mark frontend commands migrated',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async listAccountFrontendReplicas(): ReturnType<
      IPartitionApi['listAccountFrontendReplicas']
    > {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            const rows = await partitionStore.db
              .select()
              .from(accountFrontendReplicas)
              .orderBy(accountFrontendReplicas.frontendName)
              .all();
            return rows.map(row => ({
              accountId: row.accountId,
              accountName: row.accountName,
              actorId: row.actorId,
              actorName: row.actorName,
              frontendName: row.frontendName,
              frontendVersion: row.frontendVersion,
              databaseName: `${row.id}/${row.databaseName}`,
              status: row.status,
              role: row.role,
              frontendIndex: row.frontendIndex,
              replicaIndex: row.replicaIndex,
              activeProviderCount:
                accountReplicaRuntimes
                  .get(`${this.props.partitionKey}/account/${row.id}`)
                  ?.activeProviderCount() ?? 0,
              socketState: row.socketState,
              reconnectAttempt: row.reconnectAttempt,
              journalHealth: row.journalHealth,
              hasPendingTransition: row.pendingTransition !== null,
              sourceTargets: Schema.decodeUnknownSync(
                Schema.parseJson(accountFrontendSourceTargetsSchema),
              )(row.sourceTargets, { onExcessProperty: 'error' }),
              lastFailure:
                row.lastFailure === null
                  ? null
                  : Schema.encodeUnknownSync(ZerospinError.schema)(
                      ZerospinError.parse(row.lastFailure),
                    ),
            }));
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'list-account-frontend-replicas-failed',
                  message: 'Failed to list account frontend replicas',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

    async listServiceFrontendReplicas(): ReturnType<
      IPartitionApi['listServiceFrontendReplicas']
    > {
      return runtime.runPromise(
        Effect.tryPromise({
          try: async () => {
            const partitionStore = partitionStores.get(
              `${systemId}/${generationId}/${this.props.partitionKey}`,
            );
            if (partitionStore === undefined) {
              throw new ZerospinError({
                code: 'shared-worker-partition-store-missing',
                message: 'SharedWorker partition store was not initialized',
              });
            }
            const rows = await partitionStore.db
              .select()
              .from(serviceFrontendReplicas)
              .orderBy(serviceFrontendReplicas.frontendName)
              .all();
            return rows.map(row => ({
              serviceName: row.serviceName,
              actorId: row.actorId,
              actorName: row.actorName,
              frontendName: row.frontendName,
              frontendVersion: row.frontendVersion,
              databaseName: `${row.id}/${row.databaseName}`,
              status: row.status,
              role: row.role,
              frontendIndex: row.frontendIndex,
              replicaIndex: row.replicaIndex,
              activeProviderCount:
                serviceReplicaRuntimes
                  .get(`${this.props.partitionKey}/service/${row.id}`)
                  ?.activeProviderCount() ?? 0,
              socketState: row.socketState,
              reconnectAttempt: row.reconnectAttempt,
              pendingTransition:
                row.pendingTransition === null
                  ? null
                  : Schema.decodeUnknownSync(
                      Schema.parseJson(
                        ServiceFrontendLineageTransitionRequiredSchema,
                      ),
                    )(row.pendingTransition, {
                      onExcessProperty: 'error',
                    }),
              lastFailure:
                row.lastFailure === null
                  ? null
                  : Schema.encodeUnknownSync(ZerospinError.schema)(
                      ZerospinError.parse(row.lastFailure),
                    ),
            }));
          },
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'list-service-frontend-replicas-failed',
                  message: 'Failed to list service frontend replicas',
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        }).pipe(encodeRpc),
      );
    }

  }

  class SharedSystemWorkerApi extends RpcTarget {
    constructor(
      private readonly props: {
        systemId: string;
        generationId: string;
        ownerToken: object;
      },
    ) {
      super();
    }

    async getPartitionApi(props: {
      partitionKey: string;
    }): Promise<PartitionApi> {
      const { systemId, generationId, ownerToken } = this.props;
      const { partitionKey } = props;
      if (partitionKey.length === 0) {
        throw new Error('SharedWorker partitionKey must be non-empty');
      }

      const partitionStoreKey = `${systemId}/${generationId}/${partitionKey}`;
      const existingPartitionStore = partitionStores.get(partitionStoreKey);
      if (existingPartitionStore !== undefined) {
        return new PartitionApi({ partitionKey, ownerToken });
      }

      let openPromise = partitionOpenPromises.get(partitionStoreKey);
      if (openPromise === undefined) {
        openPromise = runtime.runPromise(
          Effect.gen(function* () {
            const vfsName = yield* makeVfsName({
              systemId,
              generationId,
              partitionKey,
            });
            const partitionSqlite = yield* Effect.tryPromise({
              try: () =>
                makeIdbSQLite3({
                  databaseName: partitionDatabaseName,
                  vfsName,
                  wasmUrl: sharedWorkerWasmUrl,
                }),
              catch: ZerospinError.catch({
                code: 'open-shared-worker-partition-db-failed',
                message: 'Failed to open SharedWorker partition DB',
              }),
            });
            const db = makeAsyncWaSqliteDrizzle(
              partitionSqlite,
              partitionDbConfig,
            );
            yield* migratePartitionDbAsync({ db });
            return {
              partitionKey,
              partitionSqlite,
              db,
              systemId,
              generationId,
              vfsName,
              acquisitionTail: Promise.resolve(),
            };
          }),
        );
        partitionOpenPromises.set(partitionStoreKey, openPromise);
      }

      try {
        const partitionStore = await openPromise;
        partitionStores.set(partitionStoreKey, partitionStore);
      } finally {
        partitionOpenPromises.delete(partitionStoreKey);
      }
      return new PartitionApi({ partitionKey, ownerToken });
    }

    [Symbol.dispose](): void {
      for (const replicaRuntime of accountReplicaRuntimes.values()) {
        void replicaRuntime.releaseOwner(this.props.ownerToken);
      }
      for (const replicaRuntime of serviceReplicaRuntimes.values()) {
        void replicaRuntime.releaseOwner(this.props.ownerToken);
      }
    }
  }

  globalThis.addEventListener('connect', event => {
    if (!(event instanceof MessageEvent)) return;
    const port = event.ports[0];
    if (!(port instanceof MessagePort)) return;

    const ownerToken = {};
    const localApi = new SharedSystemWorkerApi({
      systemId,
      generationId,
      ownerToken,
    });
    port.start();
    newMessagePortRpcSession(port, localApi);

    const releasePortRegistrations = () => {
      localApi[Symbol.dispose]();
    };
    port.addEventListener('messageerror', releasePortRegistrations, {
      once: true,
    });
    port.addEventListener('close', releasePortRegistrations, { once: true });
  });
}
