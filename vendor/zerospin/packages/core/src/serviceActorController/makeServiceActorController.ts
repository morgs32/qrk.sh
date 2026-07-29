import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type {
  IActorId,
  IAssertValidModels,
  IModels,
} from '../models/types.ts';
import type { IServiceFrontendController } from '../serviceFrontendController/types.ts';
import type { ITypeError } from '../utils/types.ts';

import type {
  IServiceActorController,
  IServiceFrontendBinding,
} from './types.ts';

export function makeServiceActorController<
  NAME extends string,
  VERSION extends string,
  MODELS extends IModels,
  const FRONTEND_CONTROLLERS extends Record<
    string,
    IServiceFrontendController
  >,
  AUTH_CONTEXTS extends {
    [K in keyof FRONTEND_CONTROLLERS & string]: unknown;
  },
>(props: {
  name: NAME;
  version: VERSION;
  models: MODELS & IAssertValidModels<MODELS>;
  frontends: {
    [K in keyof FRONTEND_CONTROLLERS & string]: {
      frontendController: FRONTEND_CONTROLLERS[K] & {
        actorName: NAME;
        frontendName: K;
        models: FRONTEND_CONTROLLERS[K]['models'] & {
          [MODEL_KEY in keyof FRONTEND_CONTROLLERS[K]['models'] &
            string]: MODEL_KEY extends keyof MODELS & string
            ? MODELS[MODEL_KEY] extends FRONTEND_CONTROLLERS[K]['models'][MODEL_KEY]
              ? FRONTEND_CONTROLLERS[K]['models'][MODEL_KEY] extends MODELS[MODEL_KEY]
                ? FRONTEND_CONTROLLERS[K]['models'][MODEL_KEY]
                : ITypeError<`Service frontend model "${K}.${MODEL_KEY}" must exactly match actor model "${MODEL_KEY}"`>
              : ITypeError<`Service frontend model "${K}.${MODEL_KEY}" must exactly match actor model "${MODEL_KEY}"`>
            : ITypeError<`Service frontend model "${K}.${MODEL_KEY}" is missing from actor models`>;
        };
      };
      authenticate: (props: {
        signature: Schema.Schema.Type<FRONTEND_CONTROLLERS[K]['signature']>;
        db: Readonly<Pick<IDb<IResourceDbConfig<MODELS>>, 'query'>>;
      }) => Effect.Effect<IActorId, IAnyError, AUTH_CONTEXTS[K]>;
    };
  };
}): IServiceActorController<
  NAME,
  MODELS,
  {
    [K in keyof FRONTEND_CONTROLLERS & string]: IServiceFrontendBinding<
      K,
      MODELS,
      FRONTEND_CONTROLLERS[K],
      AUTH_CONTEXTS[K]
    >;
  },
  VERSION
>;
export function makeServiceActorController(props: {
  name: string;
  version: string;
  models: IModels;
  frontends: Record<
    string,
    {
      frontendController: IServiceFrontendController;
      authenticate: unknown;
    }
  >;
}) {
  const { name, version, models, frontends } = props;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(
      'makeServiceActorController: version must be a non-empty string',
    );
  }

  assertValidModels({ models, context: 'makeServiceActorController' });

  const resolvedFrontends = mapValues(frontends, (binding, key) => {
    const frontendName = String(key);
    const { frontendController, authenticate } = binding;

    if (frontendController.frontendName !== frontendName) {
      throw new Error(
        `makeServiceActorController: frontends.${frontendName} must bind a frontendController with frontendName "${frontendName}", received "${frontendController.frontendName}"`,
      );
    }

    if (frontendController.actorName !== name) {
      throw new Error(
        `makeServiceActorController: frontends.${frontendName}.frontendController must have actorName "${name}", received "${frontendController.actorName}"`,
      );
    }

    for (const [modelName, frontendModel] of Object.entries(
      frontendController.models,
    )) {
      if (models[modelName] !== frontendModel) {
        throw new Error(
          `makeServiceActorController: frontends.${frontendName}.models.${modelName} must be the same object as actor models.${modelName}`,
        );
      }
    }

    return {
      name: frontendName,
      frontendController,
      models: frontendController.models,
      authenticate,
    };
  });

  return {
    name,
    version,
    models,
    frontends: resolvedFrontends,
  };
}
