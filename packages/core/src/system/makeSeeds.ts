import '@zerospin/server-only';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IAccountControllers } from '../accountController/types.ts';
import { DeploySeedCommandSchema } from '../contracts/CommandSchema.ts';
import type {
  IAccountCommand,
  ICommand,
  IDeploySeedCommand,
  IServiceCommand,
} from '../contracts/types.ts';
import type { InferCommandPayload } from '../models/types.ts';
import type { IServiceControllers } from '../service/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

import type { ISystem } from './types.ts';

/**
 * Builds the flat command list consumed by clean deploy and clean local dev.
 *
 * 1. Account groups are resolved first, in their declared property order.
 * 2. Service groups are resolved second, in their declared property order.
 * 3. Every resolved command is checked against its group and owning contract.
 * 4. The original command object is appended without rebuilding its payload.
 */
export const makeSeeds = Effect.fn('makeSeeds')(function* <
  ACCOUNT_CONTROLLERS extends IAccountControllers,
  SERVICE_CONTROLLERS extends IServiceControllers,
  SYSTEM_NAME extends string,
>(props: {
  system: ISystem<ACCOUNT_CONTROLLERS, SERVICE_CONTROLLERS, SYSTEM_NAME>;
  accounts: {
    readonly [ACCOUNT_NAME in keyof ACCOUNT_CONTROLLERS]?: readonly Effect.Effect<
      {
        [CONTRACT_NAME in keyof ACCOUNT_CONTROLLERS[ACCOUNT_NAME]['contracts'] &
          string]: IAccountCommand<
          ICommand<
            ACCOUNT_CONTROLLERS[ACCOUNT_NAME]['contracts'][CONTRACT_NAME]['commandName'],
            ACCOUNT_CONTROLLERS[ACCOUNT_NAME]['contracts'][CONTRACT_NAME]['version'],
            InferCommandPayload<
              ACCOUNT_CONTROLLERS[ACCOUNT_NAME]['contracts'][CONTRACT_NAME]['payload']
            >
          >
        >;
      }[keyof ACCOUNT_CONTROLLERS[ACCOUNT_NAME]['contracts'] & string],
      IAnyError,
      CuidFactory
    >[];
  };
  services: {
    readonly [SERVICE_NAME in keyof SERVICE_CONTROLLERS]?: readonly Effect.Effect<
      {
        [CONTRACT_NAME in keyof SERVICE_CONTROLLERS[SERVICE_NAME]['contracts'] &
          string]: IServiceCommand<
          ICommand<
            SERVICE_CONTROLLERS[SERVICE_NAME]['contracts'][CONTRACT_NAME]['commandName'],
            SERVICE_CONTROLLERS[SERVICE_NAME]['contracts'][CONTRACT_NAME]['version'],
            InferCommandPayload<
              SERVICE_CONTROLLERS[SERVICE_NAME]['contracts'][CONTRACT_NAME]['payload']
            >
          >
        >;
      }[keyof SERVICE_CONTROLLERS[SERVICE_NAME]['contracts'] & string],
      IAnyError,
      CuidFactory
    >[];
  };
}): Effect.fn.Return<readonly IDeploySeedCommand[], IAnyError, CuidFactory> {
  const { accounts, services, system } = props;
  const resolvedSeeds: IDeploySeedCommand[] = [];

  // Checkpoint 1: account commands always occupy the first part of the flat list.
  for (const accountName of Object.keys(accounts)) {
    const commandEffects = accounts[accountName];
    if (commandEffects === undefined) {
      continue;
    }

    if (commandEffects.length === 0) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed account group "${accountName}" must contain at least one command`,
      });
    }

    const accountController = system.accountControllers[accountName];
    if (accountController === undefined) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed account group "${accountName}" does not exist in system "${system.name}"`,
      });
    }

    // Checkpoint 2: resolve each Effect one at a time so command order is stable.
    for (const commandToResolve of commandEffects) {
      const command = yield* commandToResolve;

      // Validate the already-decoded command without applying encoded-side defaults.
      // The validated copy is discarded so the exact makeCommand object crosses the boundary.
      yield* Schema.validate(DeploySeedCommandSchema)(command).pipe(
        Effect.mapError(
          parseError =>
            new ZerospinError({
              code: 'invalid-seeds',
              message: `Invalid command in seed account group "${accountName}": ${parseError.message}`,
            }),
        ),
      );

      if (command.commandType !== 'account') {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed account group "${accountName}" received command type "${command.commandType}"`,
        });
      }

      if (command.accountName !== accountName) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed account group "${accountName}" received accountName "${command.accountName}"`,
        });
      }

      if (command.systemName !== system.name) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed account group "${accountName}" received systemName "${command.systemName}" instead of "${system.name}"`,
        });
      }

      if (command.systemVersion !== system.version) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed account group "${accountName}" received systemVersion "${command.systemVersion}" instead of "${system.version}"`,
        });
      }

      let ownsCommandContract = false;
      for (const contract of Object.values(accountController.contracts)) {
        if (
          contract.commandName === command.commandName &&
          contract.version === command.version
        ) {
          ownsCommandContract = true;
          break;
        }
      }

      if (!ownsCommandContract) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed account group "${accountName}" has no contract for command "${command.commandName}" version "${command.version}"`,
        });
      }

      resolvedSeeds.push(command);
    }
  }

  // Checkpoint 3: service commands follow every account command in the flat list.
  for (const serviceName of Object.keys(services)) {
    const commandEffects = services[serviceName];
    if (commandEffects === undefined) {
      continue;
    }

    if (commandEffects.length === 0) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed service group "${serviceName}" must contain at least one command`,
      });
    }

    const serviceController = system.serviceControllers[serviceName];
    if (serviceController === undefined) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed service group "${serviceName}" does not exist in system "${system.name}"`,
      });
    }

    // Checkpoint 4: service Effects are also resolved sequentially and unchanged.
    for (const commandToResolve of commandEffects) {
      const command = yield* commandToResolve;

      yield* Schema.validate(DeploySeedCommandSchema)(command).pipe(
        Effect.mapError(
          parseError =>
            new ZerospinError({
              code: 'invalid-seeds',
              message: `Invalid command in seed service group "${serviceName}": ${parseError.message}`,
            }),
        ),
      );

      if (command.commandType !== 'service') {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed service group "${serviceName}" received command type "${command.commandType}"`,
        });
      }

      if (command.serviceName !== serviceName) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed service group "${serviceName}" received serviceName "${command.serviceName}"`,
        });
      }

      if (command.systemVersion !== system.version) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed service group "${serviceName}" received systemVersion "${command.systemVersion}" instead of "${system.version}"`,
        });
      }

      let ownsCommandContract = false;
      for (const contract of Object.values(serviceController.contracts)) {
        if (
          contract.commandName === command.commandName &&
          contract.version === command.version
        ) {
          ownsCommandContract = true;
          break;
        }
      }

      if (!ownsCommandContract) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed service group "${serviceName}" has no contract for command "${command.commandName}" version "${command.version}"`,
        });
      }

      resolvedSeeds.push(command);
    }
  }

  return resolvedSeeds;
});
