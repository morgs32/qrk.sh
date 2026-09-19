import type { AssertContractMutationsInModels } from '@zerospin/core/contracts/assertMutationsUseModels';
import { Contract } from '@zerospin/core/contracts/makeContractVersion';
import type {
  IAnyContractBindings,
  IContract,
} from '@zerospin/core/contracts/types';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import type { IAggregateFrontendController } from '@zerospin/core/frontendController/types';
import { assertValidModels } from '@zerospin/core/models/assertValidModels';
import { Model } from '@zerospin/core/models/defineModel';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
} from '@zerospin/core/models/types';
import { type IAnyError } from '@zerospin/error';
import { type ITypeError } from '@zerospin/schema';
import { Layer, Schema, SchemaAST, type Effect } from 'effect';

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

const AggregateFrontendPropsSchema = Schema.Struct({
  authenticationSchema: ClaimsSchema,
  guardLayer: Schema.optionalKey(
    Schema.declare(
      (
        input: unknown,
      ): input is NonNullable<IAggregateFrontendController['guardLayer']> =>
        typeof input === 'function',
    ),
  ),
  aggregateName: Schema.String,
  aggregateVersion: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  contracts: Schema.Record(Schema.String, ContractBindingSchema),
  models: ModelsRecordSchema,
});

/**
 * Authored aggregate frontend definition. No app, Provider, runtime, or
 * session-local layer — those belong to makeSession / makeRuntime.
 */
export function makeAggregateFrontend<
  const AGGREGATE_NAME extends string,
  const AGGREGATE_VERSION extends string,
  const FRONTEND_NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContractBindings,
  const AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
  GUARD_SERVICES = never,
  GUARD_REQUIREMENTS = never,
>(props: {
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  name: FRONTEND_NAME;
  authenticationSchema: AUTHENTICATION;
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
  guardLayer?: (props: {
    db: Readonly<
      Pick<
        IDb<IResourceDbConfig<NoInfer<MODELS>, Record<never, never>>>,
        'query'
      >
    >;
    authentication: NoInfer<AUTHENTICATION['Type']> | null;
  }) => Layer.Layer<
    | GUARD_SERVICES
    | NoInfer<
        Exclude<
          Effect.Services<
            ReturnType<
              NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
            >
          >,
          GUARD_SERVICES
        >
      >,
    IAnyError,
    GUARD_REQUIREMENTS
  >;
} & NoInfer<
  Exclude<
    Effect.Services<
      ReturnType<
        NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
      >
    >,
    GUARD_SERVICES
  > extends never
    ? unknown
    : { guardLayer: unknown }
>) {
  Schema.decodeUnknownSync(AggregateFrontendPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const authentication = {
    authenticationSchema: props.authenticationSchema,
  };
  const aggregateIdField =
    authentication.authenticationSchema.fields.aggregateId;
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
      'Aggregate authenticationSchema must contain a required string aggregateId',
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
  assertValidModels({ models, context: 'makeAggregateFrontend' });
  return {
    kind: 'aggregate' as const,
    authentication,
    ...(props.guardLayer === undefined
      ? {}
      : { guardLayer: props.guardLayer }),
    aggregateName: props.aggregateName,
    aggregateVersion: props.aggregateVersion,
    name: props.name,
    contracts,
    models,
    modelNames,
  } as Omit<
    IAggregateFrontendController<
      string,
      AGGREGATE_NAME,
      FRONTEND_NAME,
      CONTRACTS,
      MODELS,
      AGGREGATE_VERSION,
      never,
      never,
      AUTHENTICATION,
      GUARD_SERVICES,
      GUARD_REQUIREMENTS
    >,
    'systemName'
  > & {
    readonly __initializeRequirements?:
      | GUARD_REQUIREMENTS
      | Exclude<
          Effect.Services<
            ReturnType<
              NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
            >
          >,
          GUARD_SERVICES
        >;
  };
}
