import type { IAnyError } from '@zerospin/error';
import { Schema, type Effect } from 'effect';

import { Signature } from '../authentication/makeSignature.ts';
import type { IAuthenticationSignature } from '../authentication/types.ts';
import { Contract } from '../contracts/makeContract.ts';
import type { IContract } from '../contracts/types.ts';
import {
  AggregateFrontendController,
  ServiceFrontendController,
} from '../frontendController/makeFrontendController.ts';
import type {
  IAnyAggregateFrontendController,
  IAnyServiceFrontendController,
} from '../frontendController/types.ts';
import { Model } from '../models/makeModel.ts';
import type { IModel } from '../models/types.ts';

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);

const EffectSchemaSchema = Schema.declare(
  (input: unknown): input is Schema.Codec<unknown, unknown> =>
    Schema.isSchema(input),
);

const AuthenticateSchema = Schema.declare(
  (
    input: unknown,
  ): input is (props: {
    signature: unknown;
  }) => Effect.Effect<string, IAnyError> => typeof input === 'function',
);

const CanonicalSignatureSchema = Schema.declare(
  (input: unknown): input is IAuthenticationSignature =>
    input instanceof Signature,
);

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
);

const CanonicalServiceFrontendControllerSchema = Schema.declare(
  (input: unknown): input is IAnyServiceFrontendController =>
    input instanceof ServiceFrontendController,
);

const CanonicalAggregateFrontendControllerSchema = Schema.declare(
  (input: unknown): input is IAnyAggregateFrontendController =>
    input instanceof AggregateFrontendController,
);

const MutationEdgeSchema = Schema.Union([
  Schema.Struct({
    source: EffectSchemaSchema,
    destination: Schema.Null,
  }),
  Schema.Struct({
    source: EffectSchemaSchema,
    destination: EffectSchemaSchema,
    adapter: FunctionSchema,
  }),
]);

const MutationAdaptersSchema = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Array(MutationEdgeSchema)),
);

const ModelsRecordSchema = Schema.Record(Schema.String, CanonicalModelSchema);

const ContractsRecordSchema = Schema.Record(
  Schema.String,
  CanonicalContractSchema,
);

const SelectionSchema = Schema.Struct({
  model: CanonicalModelSchema,
  where: FunctionSchema,
});

const ServiceQuerySchema = Schema.Struct({
  paramsSchema: EffectSchemaSchema,
  query: FunctionSchema,
});

const AggregateQueryGrantSchema = Schema.Struct({
  service: Schema.String,
  query: Schema.String,
});

const ServiceFrontendBindingSchema = Schema.Struct({
  controller: CanonicalServiceFrontendControllerSchema,
  models: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  projectionAdapters: Schema.optionalKey(
    Schema.Record(Schema.String, FunctionSchema),
  ),
});

const ContractAdapterEntrySchema = Schema.Struct({
  contract: CanonicalContractSchema,
  adapt: FunctionSchema,
});

const AggregateFrontendBindingSchema = Schema.Struct({
  controller: CanonicalAggregateFrontendControllerSchema,
  models: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  projectionAdapters: Schema.optionalKey(
    Schema.Record(Schema.String, FunctionSchema),
  ),
  contractAdapters: Schema.optionalKey(
    Schema.Record(Schema.String, ContractAdapterEntrySchema),
  ),
});

const ServiceInputSchema = Schema.Struct({
  models: ModelsRecordSchema,
  contracts: ContractsRecordSchema,
  mutationAdapters: Schema.optionalKey(MutationAdaptersSchema),
  queries: Schema.optionalKey(Schema.Record(Schema.String, ServiceQuerySchema)),
  frontends: Schema.optionalKey(
    Schema.Record(Schema.String, ServiceFrontendBindingSchema),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});

const AggregateInputSchema = Schema.Struct({
  models: ModelsRecordSchema,
  contracts: ContractsRecordSchema,
  mutationAdapters: Schema.optionalKey(MutationAdaptersSchema),
  selections: Schema.Record(Schema.String, SelectionSchema),
  queries: Schema.optionalKey(
    Schema.Record(Schema.String, AggregateQueryGrantSchema),
  ),
  frontends: Schema.Record(Schema.String, AggregateFrontendBindingSchema),
  authorize: Schema.optionalKey(FunctionSchema),
});

const SystemPropsSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.NonEmptyString,
  authentication: Schema.Struct({
    signature: CanonicalSignatureSchema,
    authenticate: AuthenticateSchema,
  }),
  aggregates: Schema.Record(Schema.String, AggregateInputSchema),
  services: Schema.optionalKey(
    Schema.Record(Schema.String, ServiceInputSchema),
  ),
});

export function decodeSystemProps(props: unknown) {
  const decoded = Schema.decodeUnknownSync(SystemPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  return {
    name: decoded.name,
    version: decoded.version,
    authentication: decoded.authentication,
    aggregates: decoded.aggregates,
    services: decoded.services ?? {},
  };
}
