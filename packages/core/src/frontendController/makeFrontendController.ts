import type { AssertContractsMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import type { IContracts } from '../contracts/types.ts';
import type { IGuard } from '../guards/makeGuard.ts';
import { makeGuards } from '../guards/makeGuards.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type {
  IAssertValidModels,
  IModels,
  InferCommandPayload,
  IServiceModel,
} from '../models/types.ts';
import { makeUnstagedCommand } from '../session/makeUnstagedCommand.ts';
import type { ITypeError } from '../utils/types.ts';

import type {
  IAggregateFrontendController,
  IFrontendController,
  IServiceFrontendController,
} from './types.ts';

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
  models: MODELS & IAssertValidModels<MODELS>;
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
    IAssertValidModels<MODELS> & {
      [K in keyof MODELS]: IServiceModel<MODELS[K], SERVICE_NAME>;
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
  assertValidModels({
    models: props.models,
    context: 'makeFrontendController',
  });

  if ('serviceName' in props) {
    for (const [modelKey, model] of Object.entries(props.models)) {
      if (
        !('serviceName' in model) ||
        model.serviceName !== props.serviceName
      ) {
        throw new Error(
          `makeFrontendController: models.${modelKey} must be created by makeServiceModel with serviceName "${props.serviceName}"`,
        );
      }
    }

    return {
      kind: 'service',
      systemName: props.systemName,
      serviceName: props.serviceName,
      frontendName: props.frontendName,
      contracts: {},
      models: props.models,
      modelNames: Object.keys(props.models),
      guards: {},
    };
  }

  const guards = makeGuards({
    contracts: props.contracts,
    guards: props.guards ?? {},
  });

  return {
    kind: 'aggregate',
    systemName: props.systemName,
    aggregateName: props.aggregateName,
    frontendName: props.frontendName,
    contracts: props.contracts,
    models: props.models,
    modelNames: Object.keys(props.models),
    guards,
    makeUnstagedCommand: (
      commandProps: Parameters<
        IAggregateFrontendController['makeUnstagedCommand']
      >[0],
    ) =>
      makeUnstagedCommand({
        contracts: props.contracts,
        systemName: props.systemName,
        aggregateName: props.aggregateName,
        frontendName: props.frontendName,
        ...commandProps,
      }),
  };
}
