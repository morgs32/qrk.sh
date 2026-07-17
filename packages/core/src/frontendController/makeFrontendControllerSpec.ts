import type { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IContracts } from '../contracts/types.ts';
import type { IGuards } from '../guards/types.ts';
import type { IModels } from '../models/types.ts';

import type { IFrontendControllerSpec } from './types.ts';

type IAnyFrontendController = {
  accountName: string;
  actorName: string;
  frontendName: string;
  version: string;
  contracts: IContracts;
  systemName: string;
  models: IModels;
  modelNames: readonly string[];
  guards: IGuards<IContracts>;
  signature: Schema.Schema.AnyNoContext;
};

export function makeFrontendControllerSpec(
  frontendController: IAnyFrontendController,
): IFrontendControllerSpec {
  return {
    accountName: frontendController.accountName,
    actorName: frontendController.actorName,
    frontendName: frontendController.frontendName,
    name: frontendController.actorName,
    version: frontendController.version,
    modelNames: frontendController.modelNames,
    models: mapValues(frontendController.models ?? {}, model => ({
      modelName: model.modelName,
    })),
    contracts: mapValues(
      frontendController.contracts,
      contract => contract.spec,
    ),
  };
}
