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
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { ServiceFrontendLineageTransitionRequiredSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import { FrontendLineageTransitionRequiredSchema } from '@zerospin/core/session/FrontendBlockSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { JsonSchema7RootSchema } from '@zerospin/core/utils/JsonSchema7RootSchema';
import { ZerospinError } from '@zerospin/error';
import { Schema } from 'effect';

const encodedPrimitiveDescriptorSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal('primaryKey'),
    nullable: Schema.Literal(false),
    unique: Schema.Literal(true),
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('opaqueId'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('ref'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
    targetTableName: Schema.String,
    targetColumnName: Schema.String,
    relation: Schema.String,
    inverse: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('cursor'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('boolean'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Boolean, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal('integer'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Number, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal('number'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Number, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal('text'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.NullOr(Schema.String), {
      exact: true,
    }),
  }),
  Schema.Struct({
    kind: Schema.Literal('date'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Date, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal('enum'),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    values: Schema.NonEmptyArray(Schema.String),
    defaultValue: Schema.optionalWith(Schema.String, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal('json'),
    nullable: Schema.Boolean,
    schema: JsonSchema7RootSchema,
    defaultValue: Schema.optionalWith(Schema.Null, { exact: true }),
  }),
);

const encodedShapeSchema = Schema.Record({
  key: Schema.String,
  value: encodedPrimitiveDescriptorSchema,
});

const modelIndexSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.Array(Schema.String),
  unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
});

const modelDefinitionSchema = Schema.Struct({
  modelName: Schema.String,
  abbreviation: Schema.String,
  version: Schema.String,
  properties: encodedShapeSchema,
  indexes: Schema.Array(modelIndexSchema),
});

const accountFrontendSpecSchema = Schema.Struct({
  accountName: Schema.String,
  actorName: Schema.String,
  frontendName: Schema.String,
  name: Schema.String,
  version: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record({
    key: Schema.String,
    value: Schema.extend(
      modelDefinitionSchema,
      Schema.Struct({
        historicalDefinitions: Schema.Array(modelDefinitionSchema),
      }),
    ),
  }),
  contracts: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      payloadJsonSchema: JsonSchema7RootSchema,
      historicalDefinitions: Schema.Array(
        Schema.Struct({
          commandName: Schema.String,
          version: Schema.String,
          payloadJsonSchema: JsonSchema7RootSchema,
        }),
      ),
    }),
  }),
  signatureJsonSchema: JsonSchema7RootSchema,
});

export const accountFrontendSourceTargetsSchema = Schema.Array(
  Schema.Struct({
    generationId: makeAbbreviationIdSchema(coreAbbreviations.generation),
    accountId: makeAbbreviationIdSchema(coreAbbreviations.account),
    accountName: Schema.String,
    actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
    actorName: Schema.String,
    frontendName: Schema.String,
    frontendVersion: Schema.String,
  }),
);

const serviceFrontendSpecSchema = Schema.Struct({
  serviceName: Schema.String,
  actorName: Schema.String,
  frontendName: Schema.String,
  version: Schema.String,
  models: Schema.Record({
    key: Schema.String,
    value: Schema.extend(
      modelDefinitionSchema,
      Schema.Struct({
        historicalDefinitions: Schema.Array(modelDefinitionSchema),
      }),
    ),
  }),
  signatureJsonSchema: JsonSchema7RootSchema,
});

/*
 * The original `replicas` table is intentionally retained verbatim. Its rows
 * can point at the only database containing unpushed account commands, so the
 * new runtime treats every row as quarantined legacy materialization. Nothing
 * in normal acquisition promotes, deletes, or rewrites these rows.
 */
const replicasTable = makeTable({
  name: 'replicas',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'frp' }),
    accountId: primitives.text(),
    accountName: primitives.text(),
    actorId: primitives.text(),
    actorName: primitives.text(),
    frontendName: primitives.text(),
    frontendVersion: primitives.text(),
    databaseName: primitives.text(),
  },
  indexes: [
    {
      name: 'replicas_actor_frontend_version_idx',
      columns: ['actorId', 'frontendName', 'frontendVersion'],
      unique: true,
    },
    {
      name: 'replicas_frontend_idx',
      columns: ['frontendName'],
    },
  ],
});

const accountFrontendReplicasTable = makeTable({
  name: 'accountFrontendReplicas',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'afrp' }),
    accountId: primitives.opaqueId({
      abbreviation: coreAbbreviations.account,
    }),
    accountName: primitives.text(),
    actorId: primitives.opaqueId({ abbreviation: coreAbbreviations.actor }),
    actorName: primitives.text(),
    frontendName: primitives.text(),
    frontendVersion: primitives.text(),
    frontendSpecHash: primitives.text(),
    frontendSpec: primitives.json({ schema: accountFrontendSpecSchema }),
    sourceTargets: primitives.json({
      schema: accountFrontendSourceTargetsSchema,
    }),
    databaseName: primitives.text(),
    previousDatabaseNames: primitives.json({
      schema: Schema.Array(Schema.String),
    }),
    status: primitives.enum({
      values: ['commissioning', 'ready', 'failed'],
    }),
    role: primitives.enum({ values: ['active', 'commissioned'] }),
    replicaIndex: primitives.integer(),
    frontendIndex: primitives.integer(),
    systemVersion: primitives.text(),
    systemWorkerName: primitives.text(),
    pendingTransition: primitives.json({
      schema: FrontendLineageTransitionRequiredSchema,
      nullable: true,
    }),
    socketState: primitives.enum({
      values: ['disconnected', 'connecting', 'replaying', 'online'],
    }),
    reconnectAttempt: primitives.integer(),
    journalHealth: primitives.enum({
      values: ['healthy', 'unverified', 'corrupt'],
    }),
    writeSuspended: primitives.boolean(),
    lastFailure: primitives.json({
      schema: ZerospinError.schema,
      nullable: true,
    }),
    createdAt: primitives.date(),
    updatedAt: primitives.date(),
  },
  indexes: [
    {
      name: 'account_frontend_replicas_target_version_idx',
      columns: [
        'accountId',
        'accountName',
        'actorId',
        'actorName',
        'frontendName',
        'frontendVersion',
      ],
    },
    {
      name: 'account_frontend_replicas_frontend_status_idx',
      columns: ['frontendName', 'status'],
    },
  ],
});

const serviceFrontendReplicasTable = makeTable({
  name: 'serviceFrontendReplicas',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'sfrp' }),
    serviceName: primitives.text(),
    actorId: primitives.opaqueId({ abbreviation: coreAbbreviations.actor }),
    actorName: primitives.text(),
    frontendName: primitives.text(),
    frontendVersion: primitives.text(),
    frontendSpecHash: primitives.text(),
    frontendSpec: primitives.json({ schema: serviceFrontendSpecSchema }),
    databaseName: primitives.text(),
    previousDatabaseNames: primitives.json({
      schema: Schema.Array(Schema.String),
    }),
    status: primitives.enum({
      values: ['commissioning', 'ready', 'failed'],
    }),
    role: primitives.enum({ values: ['active', 'commissioned'] }),
    replicaIndex: primitives.integer(),
    frontendIndex: primitives.integer(),
    systemVersion: primitives.text(),
    systemWorkerName: primitives.text(),
    pendingTransition: primitives.json({
      schema: ServiceFrontendLineageTransitionRequiredSchema,
      nullable: true,
    }),
    socketState: primitives.enum({
      values: ['disconnected', 'connecting', 'replaying', 'online'],
    }),
    reconnectAttempt: primitives.integer(),
    lastFailure: primitives.json({
      schema: ZerospinError.schema,
      nullable: true,
    }),
    createdAt: primitives.date(),
    updatedAt: primitives.date(),
  },
  indexes: [
    {
      name: 'service_frontend_replicas_target_version_idx',
      columns: [
        'serviceName',
        'actorId',
        'actorName',
        'frontendName',
        'frontendVersion',
      ],
    },
    {
      name: 'service_frontend_replicas_frontend_status_idx',
      columns: ['frontendName', 'status'],
    },
  ],
});

/*
 * The command journal is partition-owned, not replica-owned. A materialized
 * account database can therefore be rebuilt or replaced without moving or
 * deleting the only durable copy of local intent.
 */
const accountFrontendCommandJournalTable = makeTable({
  name: 'accountFrontendCommandJournal',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'afcj' }),
    commandId: primitives.opaqueId({
      abbreviation: coreAbbreviations.command,
    }),
    sourceGenerationId: primitives.opaqueId({
      abbreviation: coreAbbreviations.generation,
    }),
    accountId: primitives.opaqueId({
      abbreviation: coreAbbreviations.account,
    }),
    accountName: primitives.text(),
    actorId: primitives.opaqueId({ abbreviation: coreAbbreviations.actor }),
    actorName: primitives.text(),
    frontendName: primitives.text(),
    frontendVersion: primitives.text(),
    journalKind: primitives.enum({ values: ['source', 'adapted'] }),
    command: primitives.json({
      schema: Schema.Union(
        StagedCommandSchema,
        PushedCommandSchema,
        ExecutedPushedCommandSchema,
        FailedStagedCommandSchema,
        FailedPushedCommandSchema,
      ),
    }),
    sourceCommand: primitives.json({
      schema: StagedCommandSchema,
      nullable: true,
    }),
    mutations: primitives.json({
      schema: Schema.Array(EncodedFrontendMutationSchema),
    }),
    appliedMutations: primitives.json({
      schema: Schema.Array(EncodedAppliedMutationSchema),
    }),
    stagedCursor: primitives.cursor({
      abbreviation: coreAbbreviations.stagedCursor,
    }),
    // Keep the command's exact millisecond staging provenance. The shared
    // `date()` descriptor uses SQLite's second-resolution timestamp mode,
    // which cannot round-trip the full encoded command across worker restarts.
    stagedAt: primitives.integer(),
    originalContractVersion: primitives.text(),
    originalPayload: primitives.text(),
    lifecycle: primitives.enum({
      values: [
        'staged',
        'pushing',
        'pushed',
        'failed',
        'transport-uncertain',
        'dormant',
        'migrated',
      ],
    }),
    pushProvenance: primitives.json({
      schema: PushedCommandSchema,
      nullable: true,
    }),
    terminalOutcome: primitives.json({
      schema: Schema.Union(
        ExecutedPushedCommandSchema,
        FailedStagedCommandSchema,
        FailedPushedCommandSchema,
      ),
      nullable: true,
    }),
    targetGenerationId: primitives.opaqueId({
      abbreviation: coreAbbreviations.generation,
      nullable: true,
    }),
    targetFrontendVersion: primitives.text({ nullable: true }),
    materializedReplicaIndex: primitives.integer({ nullable: true }),
    createdAt: primitives.date(),
    updatedAt: primitives.date(),
  },
  indexes: [
    {
      name: 'account_frontend_command_journal_source_command_idx',
      columns: [
        'sourceGenerationId',
        'accountId',
        'accountName',
        'actorId',
        'actorName',
        'frontendName',
        'frontendVersion',
        'journalKind',
        'commandId',
      ],
      unique: true,
    },
    {
      name: 'account_frontend_command_journal_lifecycle_idx',
      columns: [
        'accountId',
        'actorId',
        'frontendName',
        'frontendVersion',
        'lifecycle',
        'stagedCursor',
      ],
    },
  ],
});

export const partitionDbConfig = makeDbConfig({
  tables: {
    replicas: replicasTable,
    accountFrontendReplicas: accountFrontendReplicasTable,
    serviceFrontendReplicas: serviceFrontendReplicasTable,
    accountFrontendCommandJournal: accountFrontendCommandJournalTable,
  },
});

export const partitionSchemas = partitionDbConfig.schema;
export const {
  replicas,
  accountFrontendReplicas,
  serviceFrontendReplicas,
  accountFrontendCommandJournal,
} = partitionSchemas;
