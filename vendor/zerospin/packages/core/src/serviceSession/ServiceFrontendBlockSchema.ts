/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */

import { Schema } from 'effect';

import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IServiceFrontendBlock,
  IServiceFrontendReplicaBlock,
  IServiceFrontendReplicaState,
  IServiceFrontendState,
} from './types.ts';

export const ServiceFrontendBlockSchema = Schema.Struct({
  serviceName: Schema.String,
  userId: Schema.NonEmptyString,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
  lastServiceCursor: makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
  delta: Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
  }),
}) satisfies Schema.Schema<IServiceFrontendBlock, any>;

export const ServiceFrontendStateSchema = Schema.Struct({
  userId: Schema.NonEmptyString,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  systemVersion: Schema.String,
  serviceName: Schema.String,
  frontendName: Schema.String,
  frontendIndex: Schema.Number,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Schema<IServiceFrontendState, any>;

export const ServiceFrontendReplicaStateSchema = Schema.extend(
  ServiceFrontendStateSchema,
  Schema.Struct({
    serviceFrontendLockKey: Schema.String,
    replicaIndex: Schema.Number,
  }),
) satisfies Schema.Schema<IServiceFrontendReplicaState, any>;

export const ServiceFrontendReplicaBlockSchema = Schema.Struct({
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  serviceName: Schema.String,
  userId: Schema.NonEmptyString,
  frontendName: Schema.String,
  serviceFrontendLockKey: Schema.String,
  replicaIndex: Schema.Number,
  frontendIndex: Schema.Number,
  frontendBlock: ServiceFrontendBlockSchema,
}) satisfies Schema.Schema<IServiceFrontendReplicaBlock, any>;
