/*
 * System-worker annotation:
 * Implements the AccountRepo authenticate operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { getFrontendBinding } from '@zerospin/core/accountController/getFrontendBinding';
import type { IAccountCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect } from 'effect';
import { system } from 'system';

import { finalizeAccountBlock } from '../finalizeAccountBlock/finalizeAccountBlock.js';

export const authenticate = Effect.fn('AccountRepo.authenticate')(
  function* (props: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    frontendName: string;
    signature: unknown;
    db: IDb;
    storage: DurableObjectStorage;
  }) {
    const {
      generationId,
      accountId,
      accountName,
      actorName,
      db,
      signature,
      storage,
      frontendName,
    } = props;

    const frontendBinding = yield* getFrontendBinding({
      system,
      accountName,
      actorName,
      frontendName,
    });

    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    return yield* frontendBinding.authenticate({
      signature,
      db,
      makeAccountCommand: (
        props: Omit<
          Parameters<typeof accountController.makeCommand>[0],
          'accountId' | 'systemName' | 'systemVersion'
        >,
      ) =>
        accountController.makeCommand({
          ...props,
          accountId,
          systemName: system.name,
          systemVersion: system.version,
        }),
      finalizeAccountCommands: (props: {
        commands: readonly IAccountCommand[];
      }) =>
        Effect.gen(function* () {
          const { commands } = props;
          return yield* finalizeAccountBlock({
            generationId,
            accountId,
            accountName,
            commands,
            db,
            storage,
          });
        }),
    });
  },
);
