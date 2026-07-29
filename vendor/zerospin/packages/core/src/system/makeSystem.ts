import '@zerospin/server-only';
import { mapValues } from 'es-toolkit';

import type { IAccountControllers } from '../accountController/types.ts';
import type { IAnyService, IServiceControllers } from '../service/types.ts';
import type { ITypeError } from '../utils/types.ts';

import type { ISystem } from './types.ts';

/**
 * Registers accountControllers and serviceControllers for a system.
 *
 * **`accountControllers` keys:** use lowercase names aligned with each account’s
 * frontends’ `accountName` (e.g. `user`), not PascalCase (`User`).
 *
 * **`serviceControllers` keys:** use lowercase names aligned with each service’s
 * name (e.g. `catalog`), not PascalCase (`Catalog`).
 */
export function makeSystem<
  ACCOUNT_CONTROLLERS extends IAccountControllers,
  SYSTEM_NAME extends string,
  VERSION extends string,
>(props: {
  accountControllers: ACCOUNT_CONTROLLERS & {
    [K in keyof ACCOUNT_CONTROLLERS & string]: ACCOUNT_CONTROLLERS[K] extends {
      name: K;
    }
      ? ACCOUNT_CONTROLLERS[K]
      : ITypeError<`Bad accountController "${K}". The key in accountControllers should match accountController.name`>;
  };
  serviceControllers?: undefined;
  name: SYSTEM_NAME;
  version: VERSION;
}): ISystem<ACCOUNT_CONTROLLERS, {}, SYSTEM_NAME, VERSION>;

export function makeSystem<
  ACCOUNT_CONTROLLERS extends IAccountControllers,
  SERVICE_CONTROLLERS extends IServiceControllers,
  SYSTEM_NAME extends string,
  VERSION extends string,
>(props: {
  accountControllers: ACCOUNT_CONTROLLERS & {
    [K in keyof ACCOUNT_CONTROLLERS & string]: ACCOUNT_CONTROLLERS[K] extends {
      name: K;
    }
      ? ACCOUNT_CONTROLLERS[K]
      : ITypeError<`Bad accountController "${K}". The key in accountControllers should match accountController.name`>;
  };
  serviceControllers: SERVICE_CONTROLLERS & {
    [K in keyof SERVICE_CONTROLLERS & string]: SERVICE_CONTROLLERS[K] extends {
      name: K;
    }
      ? SERVICE_CONTROLLERS[K] & {
          actorControllers: SERVICE_CONTROLLERS[K]['actorControllers'] & {
            [ACTOR_KEY in keyof SERVICE_CONTROLLERS[K]['actorControllers'] &
              string]: SERVICE_CONTROLLERS[K]['actorControllers'][ACTOR_KEY] & {
              frontends: SERVICE_CONTROLLERS[K]['actorControllers'][ACTOR_KEY]['frontends'] & {
                [FRONTEND_KEY in keyof SERVICE_CONTROLLERS[K]['actorControllers'][ACTOR_KEY]['frontends'] &
                  string]: SERVICE_CONTROLLERS[K]['actorControllers'][ACTOR_KEY]['frontends'][FRONTEND_KEY] & {
                  frontendController: SERVICE_CONTROLLERS[K]['actorControllers'][ACTOR_KEY]['frontends'][FRONTEND_KEY]['frontendController'] & {
                    systemName: SYSTEM_NAME;
                  };
                };
              };
            };
          };
        }
      : ITypeError<`Bad serviceController "${K}". The key in serviceControllers should match serviceController.name`>;
  };
  name: SYSTEM_NAME;
  version: VERSION;
}): ISystem<ACCOUNT_CONTROLLERS, SERVICE_CONTROLLERS, SYSTEM_NAME, VERSION>;

/** Runtime-validated fallback for deliberately erased heterogeneous registries. */
export function makeSystem<
  ACCOUNT_CONTROLLERS extends IAccountControllers,
  SYSTEM_NAME extends string,
  VERSION extends string,
>(props: {
  accountControllers: ACCOUNT_CONTROLLERS & {
    [K in keyof ACCOUNT_CONTROLLERS & string]: ACCOUNT_CONTROLLERS[K] extends {
      name: K;
    }
      ? ACCOUNT_CONTROLLERS[K]
      : ITypeError<`Bad accountController "${K}". The key in accountControllers should match accountController.name`>;
  };
  serviceControllers: IServiceControllers;
  name: SYSTEM_NAME;
  version: VERSION;
}): ISystem<ACCOUNT_CONTROLLERS, IServiceControllers, SYSTEM_NAME, VERSION>;

export function makeSystem<
  ACCOUNT_CONTROLLERS extends IAccountControllers,
  SERVICE_CONTROLLERS extends IServiceControllers,
  SYSTEM_NAME extends string,
  VERSION extends string,
>(props: {
  accountControllers: ACCOUNT_CONTROLLERS & {
    [K in keyof ACCOUNT_CONTROLLERS & string]: ACCOUNT_CONTROLLERS[K] extends {
      name: K;
    }
      ? ACCOUNT_CONTROLLERS[K]
      : ITypeError<`Bad accountController "${K}". The key in accountControllers should match accountController.name`>;
  };
  serviceControllers?: SERVICE_CONTROLLERS | {};
  name: SYSTEM_NAME;
  version: VERSION;
}) {
  const { name, accountControllers, serviceControllers = {}, version } = props;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('makeSystem: version must be a non-empty string');
  }

  mapValues(accountControllers, (accountController, key: string) => {
    if (accountController.name !== key) {
      throw new Error(
        `makeSystem: accountControllers.${key} must have name "${key}", received "${accountController.name}"`,
      );
    }

    return accountController;
  });

  mapValues(
    serviceControllers,
    (serviceController: IAnyService, key: string) => {
      if (serviceController.name !== key) {
        throw new Error(
          `makeSystem: serviceControllers.${key} must have name "${key}", received "${serviceController.name}"`,
        );
      }

      for (const [actorControllerName, actorController] of Object.entries(
        serviceController.actorControllers,
      )) {
        for (const [frontendName, frontendBinding] of Object.entries(
          actorController.frontends,
        )) {
          if (frontendBinding.frontendController.systemName !== name) {
            throw new Error(
              `makeSystem: serviceControllers.${key}.actorControllers.${actorControllerName}.frontends.${frontendName}.frontendController must have systemName "${name}", received "${frontendBinding.frontendController.systemName}"`,
            );
          }
        }
      }

      return serviceController;
    },
  );

  return {
    name,
    accountControllers,
    serviceControllers,
    version,
  };
}
