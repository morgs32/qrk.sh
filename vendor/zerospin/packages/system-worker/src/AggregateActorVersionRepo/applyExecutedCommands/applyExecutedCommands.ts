import { AggregateTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import { aggregateVersionChainDbConfig } from '../../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import type {
  IExecutedCommandRow,
  IResolvedExecutedCommandRow,
} from '../../AggregateVersionChain/types.js';

import { applyExecutedCommandsTx } from './applyExecutedCommandsTx.js';

export type IResolvedActorInput = IResolvedExecutedCommandRow & {
  decodedCommand: typeof AggregateTerminalCommandSchema.Type;
};
/** Resolve retained command provenance before entering the synchronous projection transaction. */
export const applyExecutedCommands = Effect.fn(
  'AggregateActorVersionRepo.applyExecutedCommands',
)(function* (props: {
  rows: readonly IExecutedCommandRow[];
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
  };
}) {
  const versions = yield* getByKeyOrThrow({
    record: config.system.aggregates,
    key: props.key.aggregateName,
    recordKind: 'aggregates',
  });
  const aggregate = yield* getByKeyOrThrow({
    record: versions,
    key: props.key.aggregateVersion,
    recordKind: 'listed versions',
  });
  const inputs: IResolvedActorInput[] = [];
  for (const row of props.rows) {
    if (!('kind' in row)) {
      return yield* makeZerospinError('aggregate-result-missing');
    }
    {
      if (!Array.isArray(row.operations)) {
        return yield* makeZerospinError('aggregate-operations-missing');
      }
      const decodedCommand =
        yield* aggregateVersionChainDbConfig.tables.aggregateCommands
          .decodeRow(row.command)
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.toType(AggregateTerminalCommandSchema),
              ),
            ),
            mapParseError({
              code: 'executed-command-invalid',
              prefix: 'Invalid executed command row',
            }),
          );
      inputs.push({ ...row, decodedCommand });
    }
  }
  yield* applyExecutedCommandsTx(props.db, {
    inputs,
    aggregate,
    key: props.key,
  });
});
