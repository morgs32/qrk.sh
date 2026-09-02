import '@zerospin/server-only';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IAggregates } from '../aggregate/types.ts';
import { SeedCommandSchema } from '../contracts/CommandSchema.ts';
import type {
  IAggregateCommand,
  ICommand,
  ISeedCommand,
  IServiceCommand,
} from '../contracts/types.ts';
import type { InferCommandPayload } from '../models/types.ts';
import type { IServices } from '../service/types.ts';

import type { ISystem } from './types.ts';

/**
 * Builds the flat command list consumed by clean deploy and clean local dev.
 *
 * 1. Aggregate groups are resolved first, in their declared property order.
 * 2. Service groups are resolved second, in their declared property order.
 * 3. Every resolved command is checked against its group and owning contract.
 * 4. The original command object is appended without rebuilding its payload.
 */
export const makeSeeds = Effect.fn('makeSeeds')(function* <
  AGGREGATES extends IAggregates,
  SERVICES extends IServices,
  SYSTEM_NAME extends string,
>(props: {
  system: Pick<
    ISystem<AGGREGATES, SERVICES, SYSTEM_NAME>,
    'name' | 'aggregates' | 'services'
  >;
  aggregates: {
    readonly [AGGREGATE_NAME in keyof AGGREGATES]?: readonly Effect.Effect<
      {
        [CONTRACT_NAME in keyof AGGREGATES[AGGREGATE_NAME]['contracts'] &
          string]: IAggregateCommand<
          ICommand<
            AGGREGATES[AGGREGATE_NAME]['contracts'][CONTRACT_NAME]['commandName'],
            AGGREGATES[AGGREGATE_NAME]['contracts'][CONTRACT_NAME]['version'],
            InferCommandPayload<
              AGGREGATES[AGGREGATE_NAME]['contracts'][CONTRACT_NAME]['payload']
            >
          >
        >;
      }[keyof AGGREGATES[AGGREGATE_NAME]['contracts'] & string],
      IAnyError,
      CuidFactory
    >[];
  };
  services: {
    readonly [SERVICE_NAME in keyof SERVICES]?: readonly Effect.Effect<
      {
        [CONTRACT_NAME in keyof SERVICES[SERVICE_NAME]['contracts'] &
          string]: IServiceCommand<
          ICommand<
            SERVICES[SERVICE_NAME]['contracts'][CONTRACT_NAME]['commandName'],
            SERVICES[SERVICE_NAME]['contracts'][CONTRACT_NAME]['version'],
            InferCommandPayload<
              SERVICES[SERVICE_NAME]['contracts'][CONTRACT_NAME]['payload']
            >
          >
        >;
      }[keyof SERVICES[SERVICE_NAME]['contracts'] & string],
      IAnyError,
      CuidFactory
    >[];
  };
}): Effect.fn.Return<readonly ISeedCommand[], IAnyError, CuidFactory> {
  const { aggregates, services, system } = props;
  const resolvedSeeds: ISeedCommand[] = [];

  // Checkpoint 1: aggregate commands always occupy the first part of the flat list.
  for (const aggregateName of Object.keys(aggregates)) {
    const commandEffects = aggregates[aggregateName];
    if (commandEffects === undefined) {
      continue;
    }

    if (commandEffects.length === 0) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed aggregate group "${aggregateName}" must contain at least one command`,
      });
    }

    const aggregate = system.aggregates[aggregateName];
    if (aggregate === undefined) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed aggregate group "${aggregateName}" does not exist in system "${system.name}"`,
      });
    }

    // Checkpoint 2: resolve each Effect one at a time so command order is stable.
    for (const commandToResolve of commandEffects) {
      const command = yield* commandToResolve;

      // Validate the already-decoded command without applying encoded-side defaults.
      // The validated copy is discarded so the exact makeCommand object crosses the boundary.
      yield* Schema.decodeEffect(Schema.toType(SeedCommandSchema))(
        command,
      ).pipe(
        Effect.mapError(
          parseError =>
            new ZerospinError({
              code: 'invalid-seeds',
              message: `Invalid command in seed aggregate group "${aggregateName}": ${parseError.message}`,
            }),
        ),
      );

      if (command.aggregateName !== aggregateName) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed aggregate group "${aggregateName}" received aggregateName "${command.aggregateName}"`,
        });
      }

      if (command.systemName !== system.name) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed aggregate group "${aggregateName}" received systemName "${command.systemName}" instead of "${system.name}"`,
        });
      }

      let ownsCommandContract = false;
      for (const contract of Object.values(aggregate.contracts)) {
        if (
          contract.commandName === command.commandName &&
          contract.version === command.contractVersion
        ) {
          ownsCommandContract = true;
          break;
        }
      }

      if (!ownsCommandContract) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed aggregate group "${aggregateName}" has no contract for command "${command.commandName}" version "${command.contractVersion}"`,
        });
      }

      resolvedSeeds.push(command);
    }
  }

  // Checkpoint 3: service commands follow every aggregate command in the flat list.
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

    const service = system.services[serviceName];
    if (service === undefined) {
      return yield* new ZerospinError({
        code: 'invalid-seeds',
        message: `Seed service group "${serviceName}" does not exist in system "${system.name}"`,
      });
    }

    // Checkpoint 4: service Effects are also resolved sequentially and unchanged.
    for (const commandToResolve of commandEffects) {
      const command = yield* commandToResolve;

      yield* Schema.decodeEffect(Schema.toType(SeedCommandSchema))(
        command,
      ).pipe(
        Effect.mapError(
          parseError =>
            new ZerospinError({
              code: 'invalid-seeds',
              message: `Invalid command in seed service group "${serviceName}": ${parseError.message}`,
            }),
        ),
      );

      if (command.serviceName !== serviceName) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed service group "${serviceName}" received serviceName "${command.serviceName}"`,
        });
      }

      let ownsCommandContract = false;
      for (const contract of Object.values(service.contracts)) {
        if (
          contract.commandName === command.commandName &&
          contract.version === command.contractVersion
        ) {
          ownsCommandContract = true;
          break;
        }
      }

      if (!ownsCommandContract) {
        return yield* new ZerospinError({
          code: 'invalid-seeds',
          message: `Seed service group "${serviceName}" has no contract for command "${command.commandName}" version "${command.contractVersion}"`,
        });
      }

      resolvedSeeds.push(command);
    }
  }

  return resolvedSeeds;
});
