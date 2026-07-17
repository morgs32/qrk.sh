import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';

import type { IModels } from './types.ts';

export function assertValidModels<MODELS extends IModels>(props: {
  models: MODELS;
  context: string;
}): void {
  const { models, context } = props;
  for (const key in models) {
    if (!Object.hasOwn(models, key)) {
      continue;
    }
    const model = models[key];
    if (model === undefined) {
      continue;
    }
    if (model.modelName !== key) {
      throw new Error(
        `${context}: models key "${key}" must equal model.modelName "${model.modelName}"`,
      );
    }

  }

  void makeResourceDbConfig({ models });
}
