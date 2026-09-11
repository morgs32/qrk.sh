import type { RoutePattern } from '@remix-run/route-pattern';
import type { IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Layer, Schema, SchemaAST } from 'effect';

import { AuthenticationSchema } from '../authentication/AuthenticationSchema.ts';
import type { IAuthentication } from '../authentication/types.ts';
import type { AssertContractMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import { Contract } from '../contracts/makeVersion.ts';
import type { IAnyContractBindings, IContract } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/makeModel.ts';
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

const ServiceFrontendControllerPropsSchema = Schema.Struct({
  authentication: AuthenticationSchema,
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
  authentication: AuthenticationSchema,
  guardLayer: Schema.optionalKey(
    Schema.declare(
      (
        input: unknown,
      ): input is NonNullable<IAggregateFrontendController['guardLayer']> =>
        typeof input === 'function',
    ),
  ),
  layer: Schema.optionalKey(
    Schema.declare(
      (input: unknown): input is Layer.Layer<never, IAnyError, unknown> =>
        Layer.isLayer(input),
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
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
  const AUTHENTICATION extends Omit<IAuthentication, 'authenticate'> = Omit<
    IAuthentication,
    'authenticate'
  >,
  GUARD_SERVICES = never,
  GUARD_REQUIREMENTS = never,
  const PATTERN extends string = string,
>(props: {
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  authentication: AUTHENTICATION &
    Omit<
      IAuthentication<
        AUTHENTICATION['signatureSchema'],
        AUTHENTICATION['authenticationSchema'],
        AUTHENTICATION['selectionSchema'],
        PATTERN
      >,
      'authenticate'
    > & {
      pattern: RoutePattern<PATTERN> &
        (string extends PATTERN ? never : unknown);
    };
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
  layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  guardLayer?: (props: {
    db: Readonly<
      Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
    >;
    authentication: AUTHENTICATION['authenticationSchema']['Type'] | null;
  }) => Layer.Layer<GUARD_SERVICES, IAnyError, GUARD_REQUIREMENTS>;
}): NoInfer<
  IAggregateFrontendController<
    SYSTEM_NAME,
    AGGREGATE_NAME,
    FRONTEND_NAME,
    CONTRACTS,
    MODELS,
    AGGREGATE_VERSION,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS,
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
  const AUTHENTICATION extends Omit<IAuthentication, 'authenticate'>,
  const PATTERN extends string = string,
>(props: {
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  authentication: AUTHENTICATION &
    Omit<
      IAuthentication<
        AUTHENTICATION['signatureSchema'],
        AUTHENTICATION['authenticationSchema'],
        AUTHENTICATION['selectionSchema'],
        PATTERN
      >,
      'authenticate'
    > & {
      pattern: RoutePattern<PATTERN> &
        (string extends PATTERN ? never : unknown);
    };
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
        layer?: Layer.Layer<never, IAnyError, unknown>;
        aggregateName: string;
        aggregateVersion: string;
        authentication: Omit<IAuthentication, 'authenticate'>;
        name: string;
        contracts: IAnyContractBindings;
        models: IAnyModels;
      }
    | {
        systemName: string;
        serviceName: string;
        serviceVersion: string;
        authentication: Omit<IAuthentication, 'authenticate'>;
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
      authentication: decodedProps.authentication,
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
  const aggregateIdField =
    decodedProps.authentication.authenticationSchema.fields.aggregateId;
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
    layer: props.layer ?? Layer.empty,
    authentication: decodedProps.authentication,
    guardLayer: decodedProps.guardLayer,
    systemName: decodedProps.systemName,
    aggregateName: decodedProps.aggregateName,
    aggregateVersion: decodedProps.aggregateVersion,
    name: decodedProps.name,
    contracts,
    models,
    modelNames,
  });
}
