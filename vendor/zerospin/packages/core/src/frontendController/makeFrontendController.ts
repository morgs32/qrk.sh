import { Schema } from 'effect';
import type { ITypeError } from '@zerospin/schema';

import { Contract } from '../contracts/makeContract.ts';
import type { AssertContractsMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import type { IContract, IContracts } from '../contracts/types.ts';
import type { IGuard } from '../guards/makeGuard.ts';
import { makeGuards } from '../guards/makeGuards.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/makeModel.ts';
import type {
  IAssertValidModels,
  IModel,
  IModelReplica,
  IModels,
  InferCommandPayload,
} from '../models/types.ts';

import type {
  IAggregateFrontendController,
  IFrontendController,
  IServiceFrontendController,
} from './types.ts';

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const GuardSchema = Schema.Struct({
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  program: FunctionSchema,
});

const ModelsRecordSchema = Schema.Record(Schema.String, CanonicalModelSchema);

const ServiceFrontendControllerPropsSchema = Schema.Struct({
  systemName: Schema.String,
  serviceName: Schema.String,
  frontendName: Schema.String,
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
  systemName: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  contracts: Schema.Record(
    Schema.String,
    Schema.declare((input: unknown): input is IContract => input instanceof Contract),
  ),
  models: ModelsRecordSchema,
  guards: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Array(GuardSchema)),
  ),
});

export class ServiceFrontendController {}

export class AggregateFrontendController {}

export function makeFrontendController<
  SYSTEM_NAME extends string,
  AGGREGATE_NAME extends string,
  FRONTEND_NAME extends string,
  CONTRACTS extends IContracts,
  MODELS extends IModels,
  GUARDS extends {
    [K in keyof CONTRACTS & string]?: ReadonlyArray<
      IGuard<string, IModels, InferCommandPayload<CONTRACTS[K]['payload']>>
    >;
  } = {},
>(props: {
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  frontendName: FRONTEND_NAME;
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, MODELS> & {
      [K in keyof CONTRACTS & string]: K extends CONTRACTS[K]['commandName']
        ? CONTRACTS[K]
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
  models: MODELS & IAssertValidModels<NoInfer<MODELS>>;
  guards?: GUARDS & {
    [K in keyof GUARDS & string]: K extends keyof CONTRACTS & string
      ? GUARDS[K]
      : ITypeError<`Bad guard "${K}". Keys in guards must be contract command names`>;
  };
}): IAggregateFrontendController<
  SYSTEM_NAME,
  AGGREGATE_NAME,
  FRONTEND_NAME,
  CONTRACTS,
  MODELS,
  {
    [K in keyof CONTRACTS & string]: K extends keyof GUARDS
      ? NonNullable<GUARDS[K]>
      : readonly [];
  }
>;

export function makeFrontendController<
  SYSTEM_NAME extends string,
  SERVICE_NAME extends string,
  FRONTEND_NAME extends string,
  MODELS extends IModels,
>(props: {
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  frontendName: FRONTEND_NAME;
  models: MODELS &
    IAssertValidModels<NoInfer<MODELS>> & {
      [K in keyof MODELS]: MODELS[K] extends IModelReplica
        ? ITypeError<`Service frontend model "${MODELS[K]['modelName']}" must be authoritative, not a replica`>
        : MODELS[K];
    };
  contracts?: never;
  guards?: never;
}): IServiceFrontendController<
  SYSTEM_NAME,
  SERVICE_NAME,
  FRONTEND_NAME,
  MODELS
>;

export function makeFrontendController(
  props:
    | {
        systemName: string;
        aggregateName: string;
        frontendName: string;
        contracts: IContracts;
        models: IModels;
        guards?: Partial<{
          [K in keyof IContracts & string]: readonly IGuard[];
        }>;
      }
    | {
        systemName: string;
        serviceName: string;
        frontendName: string;
        models: IModels;
        contracts?: never;
        guards?: never;
      },
): IFrontendController {
  if ('serviceName' in props) {
    Schema.decodeUnknownSync(ServiceFrontendControllerPropsSchema, {
      onExcessProperty: 'error',
    })(props);
    assertValidModels({
      models: props.models,
      context: 'makeFrontendController',
    });
    return Object.assign(new ServiceFrontendController(), {
      kind: 'service' as const,
      systemName: props.systemName,
      serviceName: props.serviceName,
      frontendName: props.frontendName,
      contracts: {},
      models: props.models,
      modelNames: Object.keys(props.models),
      guards: {},
    });
  }

  Schema.decodeUnknownSync(AggregateFrontendControllerPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  assertValidModels({
    models: props.models,
    context: 'makeFrontendController',
  });
  const guards = makeGuards({
    contracts: props.contracts,
    guards: props.guards ?? {},
  });

  return Object.assign(new AggregateFrontendController(), {
    kind: 'aggregate' as const,
    systemName: props.systemName,
    aggregateName: props.aggregateName,
    frontendName: props.frontendName,
    contracts: props.contracts,
    models: props.models,
    modelNames: Object.keys(props.models),
    guards,
  });
}
