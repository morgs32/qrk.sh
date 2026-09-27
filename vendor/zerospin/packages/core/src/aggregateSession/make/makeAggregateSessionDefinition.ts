import { type ITypeError } from '@zerospin/schema';
import { Schema, SchemaAST } from 'effect';

import type { AssertContractMutationsInModels } from '../../contracts/assertMutationsUseModels.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import type { IAnyContractBindings, IContract } from '../../contracts/types.ts';
import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
} from '../../models/types.ts';
import type { IAggregateSessionDefinition } from '../types.ts';

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const ContractBindingSchema = Schema.Struct({
  contract: Schema.declare(
    (input: unknown): input is IContract => input instanceof Contract,
  ),
});

const ModelsRecordSchema = Schema.Record(Schema.String, CanonicalModelSchema);

const ClaimsSchema = Schema.declare(
  (
    input: unknown,
  ): input is Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > =>
    Schema.isSchema(input) && 'fields' in input && input.ast._tag === 'Objects',
);

export const AggregateSessionPropsSchema = Schema.Struct({
  identitySchema: ClaimsSchema,
  aggregateName: Schema.String,
  aggregateVersion: Schema.String.check(Schema.isMinLength(1)),
  actorName: Schema.String,
  actorVersion: Schema.String,
  sessionName: Schema.String,
  contracts: Schema.Record(Schema.String, ContractBindingSchema),
  models: ModelsRecordSchema,
});

/**
 * Authored aggregate session definition. No app, Provider, runtime, or
 * application layer — those belong to makeSession.
 */
export function makeAggregateSessionDefinition<
  const AGGREGATE_NAME extends string,
  const AGGREGATE_VERSION extends string,
  const DEFINITION_NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContractBindings,
  const IDENTITY extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
  const ACTOR_NAME extends string = string,
  const ACTOR_VERSION extends string = string,
>(props: {
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  actorName: ACTOR_NAME;
  actorVersion: ACTOR_VERSION;
  sessionName: DEFINITION_NAME;
  identitySchema: IDENTITY;
  models: MODELS & IAssertValidModels<NoInfer<MODELS>>;
  contracts: CONTRACTS & {
    [K in keyof CONTRACTS &
      string]: K extends CONTRACTS[K]['contract']['commandName']
      ? CONTRACTS[K] & {
          contract: AssertContractMutationsInModels<
            CONTRACTS[K]['contract'],
            NoInfer<MODELS>
          >;
          guard?: never;
        }
      : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
  };
}) {
  Schema.decodeUnknownSync(AggregateSessionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const identity = {
    identitySchema: props.identitySchema,
  };
  const aggregateIdField = identity.identitySchema.fields.aggregateId;
  const aggregateIdAst =
    aggregateIdField === undefined
      ? undefined
      : SchemaAST.toType(aggregateIdField.ast);
  if (
    aggregateIdAst === undefined ||
    aggregateIdAst.context?.isOptional ||
    (aggregateIdAst._tag !== 'String' &&
      !(
        aggregateIdAst._tag === 'Literal' &&
        typeof aggregateIdAst.literal === 'string'
      ))
  ) {
    throw new Error(
      'Aggregate identitySchema must contain a required string aggregateId',
    );
  }

  const models: Readonly<MODELS> = { ...props.models };
  const contracts: {
    [K in keyof CONTRACTS]: { contract: CONTRACTS[K]['contract'] };
  } = { ...props.contracts };
  for (const commandName in contracts) {
    contracts[commandName] = { ...contracts[commandName] };
  }
  const modelNames: readonly string[] = Object.keys(models);
  assertValidModels({ models, context: 'makeAggregateSessionDefinition' });
  return {
    kind: 'aggregate' as const,
    identity,
    aggregateName: props.aggregateName,
    aggregateVersion: props.aggregateVersion,
    actorName: props.actorName,
    actorVersion: props.actorVersion,
    sessionName: props.sessionName,
    contracts,
    models,
    modelNames,
  } as Omit<
    IAggregateSessionDefinition<
      string,
      AGGREGATE_NAME,
      DEFINITION_NAME,
      CONTRACTS,
      MODELS,
      AGGREGATE_VERSION,
      IDENTITY
    >,
    'systemName'
  > & {
    readonly actorName: ACTOR_NAME;
    readonly actorVersion: ACTOR_VERSION;
  };
}
