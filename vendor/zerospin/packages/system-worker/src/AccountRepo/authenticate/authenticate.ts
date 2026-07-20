/*
 * System-worker annotation:
 * Implements the AccountRepo authenticate operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { getFrontendBinding } from '@zerospin/core/accountController/getFrontendBinding';
import { makeAccountCommand } from '@zerospin/core/accountController/makeAccountCommand';
import type {
  IAccountCommand,
  IContract,
} from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
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

    return yield* frontendBinding.authenticate({
      signature,
      db,
      makeAccountCommand: <CONTRACT extends IContract>(props: {
        contract: CONTRACT;
        payload: Parameters<typeof makeAccountCommand<CONTRACT>>[0]['payload'];
      }) =>
        makeAccountCommand<CONTRACT>({
          contract: props.contract,
          payload: props.payload,
          accountId,
          accountName,
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
