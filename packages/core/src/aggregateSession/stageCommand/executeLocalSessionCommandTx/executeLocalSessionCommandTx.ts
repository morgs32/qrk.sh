import { mapParseError } from '@zerospin/error';

import type { ISessionCommandInput } from '../../../contracts/types.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { IDb, ITx } from '../../../drizzle/types.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import {
  applySessionCommandTx,
  type IApplySessionCommandTxProps,
} from '../applySessionCommandTx/applySessionCommandTx.ts';

/** Commit local execution without retaining pending optimism. */
export function executeLocalSessionCommandTx<
  COMMAND extends ISessionCommandInput,
  RESULT,
>(db: IDb, props: IApplySessionCommandTxProps<COMMAND, RESULT>) {
  const execute = makeTx('executeLocalSessionCommandTx')(function* (
    tx: ITx,
    props: IApplySessionCommandTxProps<COMMAND, RESULT>,
  ) {
    const occurrence = yield* applySessionCommandTx(tx, props);
    const commandRow = yield* sessionRepoDbConfig.tables.commands
      .encodeRow({
        ...occurrence.commandRow,
        executedIndex: props.state.executedIndex,
        executedHash: props.state.executedHash,
      })
      .pipe(
        mapParseError({
          code: 'session-command-encode-failed',
          prefix: 'Failed to encode staged session command',
        }),
      );
    tx.insert(sessionRepoDbConfig.schema.commands).values(commandRow).run();

    return {
      command: occurrence.command,
      encodedCommand: occurrence.encodedCommand,
    };
  });
  return execute(db, props);
}
