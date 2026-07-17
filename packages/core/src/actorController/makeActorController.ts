import '@zerospin/server-only';
import { Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAuthorizeFn } from '../authorize/makeAuthorize.ts';
import {
  identityContractAdapt,
  type IContractAdapterEntry,
} from '../contracts/makeContractAdapter.ts';
import type { IContract } from '../contracts/types.ts';
import { makeActorCommand } from '../frontendBinding/makeActorCommand.ts';
import type {
  IAnyFrontendBindingProps,
  IContractAdapters,
  IFrontendBinding,
  IFrontendBindingProps,
} from '../frontendBinding/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type { ISelection, ISelectionWhere } from '../models/makeSelection.ts';
import type { IAssertValidModels, IModel, IModels } from '../models/types.ts';

import type {
  IActorController,
  IAnyActorApi,
  IAnyServiceQuery,
} from './types.ts';

type IFrontendBindingInput = {
  frontendController: IAnyFrontendBindingProps['frontendController'];
  authenticate: unknown;
  modelAdapters?: Record<string, unknown>;
  contractAdapters?: Record<string, IContractAdapterEntry>;
};

type IFrontendControllerInput = Pick<
  IFrontendBindingInput['frontendController'],
  | 'accountName'
  | 'actorName'
  | 'frontendName'
  | 'version'
  | 'contracts'
  | 'systemName'
  | 'models'
  | 'signature'
>;

type IFrontendContractAdapters<
  FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
> = Partial<{
  [K in keyof FRONTEND_CONTROLLERS]: IContractAdapters<
    FRONTEND_CONTROLLERS[K]['contracts']
  >;
}>;

type IContractAdaptersAt<
  FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
  CONTRACT_ADAPTERS extends IFrontendContractAdapters<FRONTEND_CONTROLLERS>,
  K extends keyof FRONTEND_CONTROLLERS,
> = K extends keyof CONTRACT_ADAPTERS
  ? CONTRACT_ADAPTERS[K] extends IContractAdapters<
      FRONTEND_CONTROLLERS[K]['contracts']
    >
    ? CONTRACT_ADAPTERS[K]
    : {}
  : {};

type IResolvedFrontendBindings<
  MODELS extends IModels,
  FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
  CONTRACT_ADAPTERS extends IFrontendContractAdapters<FRONTEND_CONTROLLERS>,
> = {
  [K in keyof FRONTEND_CONTROLLERS & string]: IFrontendBinding<
    K,
    MODELS,
    FRONTEND_CONTROLLERS[K],
    IContractAdaptersAt<FRONTEND_CONTROLLERS, CONTRACT_ADAPTERS, K>
  >;
};

type IProps<
  NAME extends string,
  VERSION extends string,
  MODELS extends IModels,
  SELECTIONS extends {
    [K in keyof MODELS]: ISelection<MODELS[K]>;
  },
  FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
  CONTRACT_ADAPTERS extends IFrontendContractAdapters<FRONTEND_CONTROLLERS>,
> = {
  name: NAME;
  version: VERSION;
  models: MODELS & IAssertValidModels<MODELS>;
  selections: SELECTIONS & {
    [K in keyof MODELS]: ReturnType<
      SELECTIONS[K]['where']
    > extends ISelectionWhere<MODELS[K], MODELS>
      ? SELECTIONS[K]
      : never;
  } & {
    [K in Exclude<keyof SELECTIONS, keyof MODELS>]: never;
  };
  frontends: {
    [K in keyof FRONTEND_CONTROLLERS & string]: IFrontendBindingProps<
      MODELS,
      FRONTEND_CONTROLLERS[K],
      IContractAdaptersAt<FRONTEND_CONTROLLERS, CONTRACT_ADAPTERS, K>
    >;
  };
  authorize?: IAuthorizeFn;
};

export function makeActorController<
  NAME extends string,
  VERSION extends string,
  MODELS extends IModels,
  SELECTIONS extends {
    [K in keyof MODELS]: ISelection<MODELS[K]>;
  },
  const FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
  const CONTRACT_ADAPTERS extends
    IFrontendContractAdapters<FRONTEND_CONTROLLERS> = {},
>(
  props: IProps<
    NAME,
    VERSION,
    MODELS,
    SELECTIONS,
    FRONTEND_CONTROLLERS,
    CONTRACT_ADAPTERS
  > & {
    api?: undefined;
  },
): IActorController<
  NAME,
  MODELS,
  SELECTIONS,
  IResolvedFrontendBindings<MODELS, FRONTEND_CONTROLLERS, CONTRACT_ADAPTERS>,
  {},
  VERSION
>;

export function makeActorController<
  NAME extends string,
  VERSION extends string,
  MODELS extends IModels,
  SELECTIONS extends {
    [K in keyof MODELS]: ISelection<MODELS[K]>;
  },
  const FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
  ACTOR_API extends IAnyActorApi,
  const CONTRACT_ADAPTERS extends
    IFrontendContractAdapters<FRONTEND_CONTROLLERS> = {},
>(
  props: IProps<
    NAME,
    VERSION,
    MODELS,
    SELECTIONS,
    FRONTEND_CONTROLLERS,
    CONTRACT_ADAPTERS
  > & {
    api: ACTOR_API;
  },
): IActorController<
  NAME,
  MODELS,
  SELECTIONS,
  IResolvedFrontendBindings<MODELS, FRONTEND_CONTROLLERS, CONTRACT_ADAPTERS>,
  ACTOR_API,
  VERSION
>;

export function makeActorController<
  NAME extends string,
  VERSION extends string,
  MODELS extends IModels,
  SELECTIONS extends {
    [K in keyof MODELS]: ISelection<MODELS[K]>;
  },
  const FRONTEND_CONTROLLERS extends Record<string, IFrontendControllerInput>,
  ACTOR_API extends IAnyActorApi | {} = {},
  const CONTRACT_ADAPTERS extends
    IFrontendContractAdapters<FRONTEND_CONTROLLERS> = {},
>(
  props: IProps<
    NAME,
    VERSION,
    MODELS,
    SELECTIONS,
    FRONTEND_CONTROLLERS,
    CONTRACT_ADAPTERS
  > & {
    api?: ACTOR_API;
  },
) {
  const {
    name,
    version,
    api = {},
    models,
    selections,
    frontends,
    authorize = () => Effect.void,
  } = props;
  const frontendProps = frontends as unknown as Record<
    string,
    IFrontendBindingInput
  >;

  assertValidModels({ models, context: 'makeActorController' });

  const modelKeys = Object.keys(models);
  const selectionKeys = Object.keys(selections);
  if (modelKeys.length !== selectionKeys.length) {
    throw new Error(
      'makeActorController: selections must contain exactly one selection for every model',
    );
  }
  for (const modelKey of modelKeys) {
    const selection = selections[modelKey];
    if (selection === undefined || selection.model !== models[modelKey]) {
      throw new Error(
        `makeActorController: selections.${modelKey}.model must be the same object as models.${modelKey}`,
      );
    }
  }

  mapValues(api, (query: IAnyServiceQuery, key) => {
    const queryKey = String(key);
    if (query.name !== queryKey) {
      throw new Error(
        `makeActorController: api.${queryKey} must have name "${queryKey}", received "${query.name}"`,
      );
    }

    return query;
  });

  const resolvedFrontends = mapValues(frontendProps, (binding, key) => {
    const frontendName = String(key);
    const {
      frontendController,
      authenticate,
      modelAdapters = {},
      contractAdapters = {},
    } = binding;

    if (frontendController.frontendName !== frontendName) {
      throw new Error(
        `makeActorController: frontends.${frontendName} must bind a frontendController with frontendName "${frontendName}", received "${frontendController.frontendName}"`,
      );
    }

    const bindingModels: Record<string, IModel> = {};
    for (const [modelKey, model] of Object.entries(models)) {
      if (frontendController.models[modelKey] === undefined) {
        continue;
      }
      bindingModels[modelKey] = model;
    }

    for (const [modelKey, bindingModel] of Object.entries(bindingModels)) {
      const frontendModel = frontendController.models[modelKey];
      if (frontendModel === undefined) {
        continue;
      }
      const diverges = bindingModel.modelName !== frontendModel.modelName;
      const hasAdapter = modelKey in modelAdapters;
      if (diverges && !hasAdapter) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.modelAdapters.${modelKey} is required when actor modelName "${bindingModel.modelName}" differs from frontend modelName "${frontendModel.modelName}"`,
        );
      }
      if (!diverges && hasAdapter) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.modelAdapters.${modelKey} must not be set when actor and frontend modelName both equal "${frontendModel.modelName}"`,
        );
      }
    }

    for (const adapterKey of Object.keys(modelAdapters)) {
      if (bindingModels[adapterKey] === undefined) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.modelAdapters.${adapterKey} has no matching binding model`,
        );
      }
    }

    const contracts: Record<string, IContract> = {};
    const resolvedContractAdapters: Record<string, unknown> = {};
    for (const [contractKey, frontendContract] of Object.entries(
      frontendController.contracts,
    )) {
      const override = (
        contractAdapters as Record<string, IContractAdapterEntry>
      )[contractKey];
      if (override !== undefined) {
        contracts[contractKey] = override.contract;
        resolvedContractAdapters[contractKey] = override.adapt;
      } else {
        contracts[contractKey] = frontendContract;
        resolvedContractAdapters[contractKey] = identityContractAdapt;
      }
    }

    for (const adapterKey of Object.keys(contractAdapters)) {
      if (frontendController.contracts[adapterKey] === undefined) {
        throw new Error(
          `makeActorController: frontends.${frontendName}.contractAdapters.${adapterKey} is not a frontend contract`,
        );
      }
    }

    const makeCommand = (commandProps: {
      contractName: string;
      accountId: string;
      actorId: string;
      systemVersion: string;
      payload: never;
    }) =>
      makeActorCommand({
        contracts,
        accountName: frontendController.accountName,
        actorName: frontendController.actorName,
        systemName: frontendController.systemName,
        ...commandProps,
        frontendName,
      });

    return {
      name: frontendName,
      frontendController,
      models: bindingModels,
      contracts,
      modelAdapters,
      contractAdapters: resolvedContractAdapters,
      authenticate,
      makeCommand,
    };
  }) as unknown as IResolvedFrontendBindings<
    MODELS,
    FRONTEND_CONTROLLERS,
    CONTRACT_ADAPTERS
  >;

  return {
    name,
    version,
    models,
    selections,
    frontends: resolvedFrontends,
    authorize,
    api,
  };
}
