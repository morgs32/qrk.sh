import type { IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Schema, SchemaAST, type Layer } from 'effect';

import type { AssertContractMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import { Contract } from '../contracts/makeContractVersion.ts';
import type { IAnyContractBindings, IContract } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/defineModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
  IModelReplica,
} from '../models/types.ts';

import type {
  IAggregateFrontendController,
  IServiceFrontendController,
} from './types.ts';

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const ContractBindingSchema = Schema.Struct({
  contract: Schema.declare(
    (input: unknown): input is IContract => input instanceof Contract,
  ),
});

const ModelsRecordSchema = Schema.Record(Schema.String, CanonicalModelSchema);

const AggregateIdClaimSchema = Schema.Struct({
  aggregateId: Schema.String,
});

const ClaimsSchema = Schema.declare(
  (
    input: unknown,
  ): input is Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > =>
    Schema.isSchema(input) && 'fields' in input && input.ast._tag === 'Objects',
);

const defaultAggregateFrontendAuthentication = {
  authenticationSchema: AggregateIdClaimSchema,
};

const ServiceFrontendControllerPropsSchema = Schema.Struct({
  authenticationSchema: ClaimsSchema,
  systemName: Schema.String,
  serviceName: Schema.String,
  serviceVersion: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  models: ModelsRecordSchema.check(
    Schema.makeFilter((models: Record<string, IModel>) => {
      for (const [modelKey, model] of Object.entries(models)) {
        if (Model.isReplica(model)) {
          return `service models.${modelKey} must be authoritative, not a replica`;
        }
      }
      return true;
    }),
  ),
});

const AggregateFrontendControllerPropsSchema = Schema.Struct({
  authenticationSchema: Schema.optionalKey(ClaimsSchema),
  guardLayer: Schema.optionalKey(
    Schema.declare(
      (
        input: unknown,
      ): input is NonNullable<IAggregateFrontendController['guardLayer']> =>
        typeof input === 'function',
    ),
  ),
  systemName: Schema.String,
  aggregateName: Schema.String,
  aggregateVersion: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  contracts: Schema.Record(Schema.String, ContractBindingSchema),
  models: ModelsRecordSchema,
});

export class ServiceFrontendController {
  readonly kind = 'service';
}

export class AggregateFrontendController {
  readonly kind = 'aggregate';
}

export function makeFrontendController<
  const SYSTEM_NAME extends string,
  const AGGREGATE_NAME extends string,
  const AGGREGATE_VERSION extends string,
  const FRONTEND_NAME extends string,
  const CONTRACTS extends IAnyContractBindings,
  const MODELS extends IAnyModels,
  AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = typeof AggregateIdClaimSchema,
  GUARD_SERVICES = never,
  GUARD_REQUIREMENTS = never,
>(props: {
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  authenticationSchema?: AUTHENTICATION;
  name: FRONTEND_NAME;
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
  models: MODELS & IAssertValidModels<NoInfer<MODELS>>;
  guardLayer?: (props: {
    db: Readonly<
      Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
    >;
    authentication: AUTHENTICATION['Type'] | null;
  }) => Layer.Layer<GUARD_SERVICES, IAnyError, GUARD_REQUIREMENTS>;
}): NoInfer<
  IAggregateFrontendController<
    SYSTEM_NAME,
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
  >
>;

export function makeFrontendController<
  const SYSTEM_NAME extends string,
  const SERVICE_NAME extends string,
  const SERVICE_VERSION extends string,
  const FRONTEND_NAME extends string,
  MODELS extends IAnyModels,
  AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  >,
>(props: {
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  authenticationSchema: AUTHENTICATION;
  name: FRONTEND_NAME;
  models: MODELS &
    IAssertValidModels<NoInfer<MODELS>> & {
      [K in keyof MODELS]: MODELS[K] extends IModelReplica
        ? ITypeError<`Service frontend model "${MODELS[K]['modelName']}" must be authoritative, not a replica`>
        : MODELS[K];
    };
  contracts?: never;
}): NoInfer<
  IServiceFrontendController<
    SYSTEM_NAME,
    SERVICE_NAME,
    FRONTEND_NAME,
    MODELS,
    SERVICE_VERSION,
    AUTHENTICATION
  >
>;

export function makeFrontendController(
  props:
    | {
        systemName: string;
        aggregateName: string;
        aggregateVersion: string;
        authenticationSchema?: Schema.Struct<
          Readonly<Record<string, Schema.Codec<unknown, unknown>>>
        >;
        name: string;
        contracts: IAnyContractBindings;
        models: IAnyModels;
        guardLayer?: IAggregateFrontendController['guardLayer'];
      }
    | {
        systemName: string;
        serviceName: string;
        serviceVersion: string;
        authenticationSchema: Schema.Struct<
          Readonly<Record<string, Schema.Codec<unknown, unknown>>>
        >;
        name: string;
        models: IAnyModels;
        contracts?: never;
      },
): unknown {
  if ('serviceName' in props) {
    const decodedProps = Schema.decodeUnknownSync(
      ServiceFrontendControllerPropsSchema,
      { onExcessProperty: 'error' },
    )(props);
    const models = { ...decodedProps.models };
    const modelNames = Object.keys(models);
    const contracts = {};

    assertValidModels({
      models,
      context: 'makeFrontendController',
    });
    return Object.assign(new ServiceFrontendController(), {
      authentication: {
        authenticationSchema: decodedProps.authenticationSchema,
      },
      systemName: decodedProps.systemName,
      serviceName: decodedProps.serviceName,
      serviceVersion: decodedProps.serviceVersion,
      name: decodedProps.name,
      contracts,
      models,
      modelNames,
    });
  }

  const decodedProps = Schema.decodeUnknownSync(
    AggregateFrontendControllerPropsSchema,
    { onExcessProperty: 'error' },
  )(props);
  const authentication = {
    authenticationSchema:
      decodedProps.authenticationSchema ??
      defaultAggregateFrontendAuthentication.authenticationSchema,
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
  const contracts = Object.fromEntries(
    Object.entries(decodedProps.contracts).map(([commandName, binding]) => [
      commandName,
      { ...binding },
    ]),
  );
  const models = { ...decodedProps.models };
  const modelNames = Object.keys(models);
  assertValidModels({
    models,
    context: 'makeFrontendController',
  });

  return Object.assign(new AggregateFrontendController(), {
    authentication,
    ...(decodedProps.guardLayer === undefined
      ? {}
      : { guardLayer: decodedProps.guardLayer }),
    systemName: decodedProps.systemName,
    aggregateName: decodedProps.aggregateName,
    aggregateVersion: decodedProps.aggregateVersion,
    name: decodedProps.name,
    contracts,
    models,
    modelNames,
  });
}
