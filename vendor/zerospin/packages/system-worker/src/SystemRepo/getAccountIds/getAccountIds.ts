/*
 * System-worker annotation:
 * Implements the SystemRepo get Account Ids operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { InferIdFromAbbreviation } from '@zerospin/core/models/types';
import { Effect } from 'effect';

type IAccountTable = {
  accountId: string;
};

export const getAccountIds = Effect.fn('SystemRepo.getAccountIds')(
  function* (props: {
    db: {
      select: (selection: { accountId: string }) => {
        from: (table: IAccountTable) => { all: () => { accountId: string }[] };
      };
    };
    accountTable: IAccountTable;
  }) {
    const { db, accountTable } = props;
    yield* Effect.void;
    const rows = db
      .select({ accountId: accountTable.accountId as never })
      .from(accountTable)
      .all();
    return rows.map(row => row.accountId as InferIdFromAbbreviation);
  },
);
