/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { EncodedServiceCommandSchema } from '../contracts/CommandSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import type { IEncodedCommand } from '../contracts/types.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IServiceFrontendFinalizedCommand,
  IServiceFrontendState,
} from './types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

const EncodedZerospinErrorSchema = Schema.toEncoded(ZerospinError.schema);

const ServiceFrontendDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema),
  updated: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(RefSchema),
  mutations: Schema.Array(EncodedAppliedMutationSchema),
});

const EmptyServiceFrontendDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  updated: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  deleted: Schema.Array(RefSchema).check(Schema.isLengthBetween(0, 0)),
  mutations: Schema.Array(EncodedAppliedMutationSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
});

const serviceFrontendFields = {
  serviceIndex: positiveIndexSchema,
  serviceFrontendIndex: positiveIndexSchema,
  chainedAt: Schema.DateFromString,
};

const ServiceFrontendPendingCommandSchema = Schema.fieldsAssign({
  ...serviceFrontendFields,
  delta: Schema.Null,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const ServiceFrontendSuccessfulCommandSchema = Schema.fieldsAssign({
  ...serviceFrontendFields,
  delta: ServiceFrontendDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const ServiceFrontendFailedCommandSchema = Schema.fieldsAssign({
  ...serviceFrontendFields,
  delta: EmptyServiceFrontendDeltaSchema,
  failedAt: Schema.DateFromString,
  failure: EncodedZerospinErrorSchema,
})(EncodedServiceCommandSchema);

export const ServiceFrontendFinalizedCommandSchema = Schema.Union([
  ServiceFrontendPendingCommandSchema,
  ServiceFrontendSuccessfulCommandSchema,
  ServiceFrontendFailedCommandSchema,
]) satisfies Schema.Codec<
  IEncodedCommand<IServiceFrontendFinalizedCommand>,
  any
>;

export const ServiceFrontendStateSchema = Schema.Struct({
  userId: Schema.NonEmptyString,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  systemVersion: Schema.String,
  serviceName: Schema.String,
  frontendName: Schema.String,
  serviceIndex: nonNegativeIndexSchema,
  serviceFrontendIndex: nonNegativeIndexSchema,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IServiceFrontendState, any>;
