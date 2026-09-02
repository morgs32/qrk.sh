import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchemas } from '@zerospin/schema';
import { Effect } from 'effect';

import { getRepoTableRows as getUnqualifiedRepoTableRows } from '../../getRepoTableRows/getRepoTableRows.js';

export const getRepoTableRows = Effect.fn('SystemRepo.getRepoTableRows')(
  function* (props: {
    db: IDb;
    schema: IAnyDrizzleSchemas;
    tableName: string;
  }) {
    return yield* getUnqualifiedRepoTableRows({
      db: props.db,
      schema: props.schema,
      tableName: props.tableName,
    });
  },
);
