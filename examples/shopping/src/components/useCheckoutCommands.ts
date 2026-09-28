import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import { resolveSessionFailure } from '@zerospin/core/contracts/failureCodec';
import { makeZerospinError } from '@zerospin/error';
import { useLiveQueryOnDb } from '@zerospin/react/useLiveQueryOnDb';
import { Effect } from 'effect';
import { useStore } from 'zustand/react';

const readCommand = (row: unknown) =>
  Effect.runSync(sessionRepoDbConfig.tables.commands.decodeRow(row));

export function useCheckoutCommands<
  DEFINITION extends IAggregateSessionDefinition,
>(session: IAggregateSession<DEFINITION>) {
  const db = useStore(session.store, state => state.db);
  if (db === null) {
    throw makeZerospinError({
      code: 'session-store-not-initialized',
      message: 'Session store is not initialized',
    });
  }
  const { data: journal } = useLiveQueryOnDb({
    db,
    query: db =>
      db
        .select()
        .from(sessionRepoDbConfig.schema.commands)
        .$dynamic()
        .orderBy(sessionRepoDbConfig.schema.commands.sessionIndex),
    tableNames: ['commands'],
  });
  const commands = (journal ?? []).map(row => readCommand(row));
  // Admission sets pushIndex but does not settle optimism. An actor command is confirmation.
  const pending = commands.filter(
    command =>
      command.admission.status !== 'failed' &&
      command.execution.status === 'pending',
  );
  const latest = commands.at(-1);
  const latestFailure =
    latest === undefined
      ? null
      : latest.admission.status === 'failed'
        ? Effect.runSync(
            resolveSessionFailure(
              session.definition,
              latest.commandName,
              latest.admission.failure,
            ),
          )
        : latest.execution.status === 'failed'
          ? Effect.runSync(
              resolveSessionFailure(
                session.definition,
                latest.commandName,
                latest.execution.failure,
              ),
            )
          : null;
  return {
    pending: pending.length > 0,
    purchasePending: pending.some(
      command =>
        'commandName' in command &&
        (command.commandName === 'confirmCheckout' ||
          command.commandName === 'cancelPurchase'),
    ),
    latestFailure,
  };
}
