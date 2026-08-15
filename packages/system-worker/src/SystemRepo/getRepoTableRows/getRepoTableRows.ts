import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import { Effect } from 'effect';

import { getRepoTableRows as getUnqualifiedRepoTableRows } from '../../getRepoTableRows/getRepoTableRows.js';

export const getRepoTableRows = Effect.fn('SystemRepo.getRepoTableRows')(
  function* (props: {
    db: IDb;
    schema: IAnyDrizzleSchemas;
    generationId: string;
    tableName: string;
  }) {
    const data = yield* getUnqualifiedRepoTableRows({
      db: props.db,
      schema: props.schema,
      tableName: props.tableName,
    });
    if (props.tableName === 'selection') {
      return data;
    }
    return {
      columns: data.columns,
      rows: data.rows.filter(row => row.generationId === props.generationId),
    };
  },
);
