import { mapParseError } from '@zerospin/error';

import type { ISessionCommandInput } from '../../../contracts/types.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { IDb, ITx } from '../../../drizzle/types.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import {
  applySessionCommandTx,
  type IApplySessionCommandTxProps,
} from '../applySessionCommandTx/applySessionCommandTx.ts';

/** Commit pending staging together with the operations needed to undo it. */
export function stageSessionCommandTx<
  COMMAND extends ISessionCommandInput,
  RESULT,
>(db: IDb, props: IApplySessionCommandTxProps<COMMAND, RESULT>) {
  const execute = makeTx('stageSessionCommandTx')(function* (
    tx: ITx,
    props: IApplySessionCommandTxProps<COMMAND, RESULT>,
  ) {
    const occurrence = yield* applySessionCommandTx(tx, props);
    const commandRow = yield* sessionRepoDbConfig.tables.commands
      .encodeRow({
        ...occurrence.commandRow,
        executedIndex: null,
        executedHash: null,
      })
      .pipe(
        mapParseError({
          code: 'session-command-encode-failed',
          prefix: 'Failed to encode staged session command',
        }),
      );
    tx.insert(sessionRepoDbConfig.schema.commands).values(commandRow).run();

    const optimisticOperations =
      yield* sessionRepoDbConfig.tables.optimisticAppliedOperations
        .encodeRow({
          sessionIndex: occurrence.commandRow.sessionIndex,
          operations: occurrence.encodedCommand.staging.stagedDelta.operations,
        })
        .pipe(
          mapParseError({
            code: 'session-optimistic-operations-encode-failed',
            prefix: 'Failed to encode optimistic session operations',
          }),
        );
    tx.insert(sessionRepoDbConfig.schema.optimisticAppliedOperations)
      .values(optimisticOperations)
      .run();

    return {
      command: occurrence.command,
      encodedCommand: occurrence.encodedCommand,
    };
  });
  return execute(db, props);
}
