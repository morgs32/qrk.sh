/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */

import { Schema } from 'effect';

import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IServiceFrontendBlock,
  IServiceFrontendGenerationBoundaryBlock,
  IServiceFrontendLineageBlock,
  IServiceFrontendLineageTransitionRequired,
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
  IServiceFrontendState,
} from './types.ts';

export const ServiceFrontendBlockSchema = Schema.Struct({
  serviceName: Schema.String,
  actorName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
  lastServiceCursor: makeAbbreviationIdSchema(
    coreAbbreviations.serviceCursor,
  ),
  delta: Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
  }),
}) satisfies Schema.Schema<IServiceFrontendBlock, any>;

export const ServiceFrontendStateSchema = Schema.Struct({
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  systemVersion: Schema.String,
  systemWorkerName: Schema.String,
  serviceName: Schema.String,
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Schema<IServiceFrontendState, any>;

export const ServiceFrontendReplicaStateSchema = Schema.extend(
  ServiceFrontendStateSchema,
  Schema.Struct({
    frontendVersion: Schema.String,
    replicaIndex: Schema.Number,
  }),
) satisfies Schema.Schema<IServiceFrontendReplicaState, any>;

export const ServiceFrontendGenerationBoundaryBlockSchema = Schema.Struct({
  kind: Schema.Literal('generation-boundary'),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  prevGenerationId: Schema.String,
  generationId: Schema.String,
  serviceName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
}) satisfies Schema.Schema<IServiceFrontendGenerationBoundaryBlock, any>;

const ServiceFrontendResourceLineageBlockSchema = Schema.Struct({
  kind: Schema.Literal('service-frontend'),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  serviceName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendBlock: ServiceFrontendBlockSchema,
});

export const ServiceFrontendLineageBlockSchema = Schema.Union(
  ServiceFrontendGenerationBoundaryBlockSchema,
  ServiceFrontendResourceLineageBlockSchema,
) satisfies Schema.Schema<IServiceFrontendLineageBlock, any>;

export const ServiceFrontendReplicaBlockSchema = Schema.Struct({
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  serviceName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendVersion: Schema.String,
  replicaIndex: Schema.Number,
  frontendIndex: Schema.Number,
  lineageBlock: ServiceFrontendLineageBlockSchema,
}) satisfies Schema.Schema<IServiceFrontendReplicaBlock, any>;

export const ServiceFrontendLineageTransitionRequiredSchema = Schema.Struct({
  kind: Schema.Literal('lineage-transition-required'),
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  generationId: Schema.String,
  serviceName: Schema.String,
  actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
  actorName: Schema.String,
  frontendName: Schema.String,
  frontendVersion: Schema.String,
  appliedBoundaryIndex: Schema.Number,
  remainingBoundaries: Schema.Array(
    ServiceFrontendGenerationBoundaryBlockSchema,
  ),
}) satisfies Schema.Schema<IServiceFrontendLineageTransitionRequired, any>;
