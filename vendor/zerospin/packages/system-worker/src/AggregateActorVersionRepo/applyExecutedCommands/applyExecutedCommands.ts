import {
  AggregateExecutedCommandSchema,
  ServiceExecutedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import { aggregateVersionChainDbConfig } from '../../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import type { IExecutedCommandRow } from '../../AggregateVersionChain/types.js';

import { applyExecutedCommandsTx } from './applyExecutedCommandsTx.js';

/** Project VAR's immutable materialization order without remote preparation. */
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
  const latest = yield* getByKeyOrThrow({
    record: config.system.aggregates,
    key: props.key.aggregateName,
    recordKind: 'aggregates',
  });
  const aggregate = yield* getByKeyOrThrow({
    record: latest,
    key: props.key.aggregateVersion,
    recordKind: 'listed versions',
  });
  const inputs = yield* Effect.forEach(props.rows, row =>
    Effect.gen(function* () {
      const command =
        'serviceName' in row
          ? yield* aggregateVersionChainDbConfig.tables.serviceCommands
              .decodeRow(row)
              .pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(
                    Schema.toType(ServiceExecutedCommandSchema),
                  ),
                ),
              )
          : yield* aggregateVersionChainDbConfig.tables.aggregateCommands
              .decodeRow(row)
              .pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(
                    Schema.toType(AggregateExecutedCommandSchema),
                  ),
                ),
              );
      return { row, command };
    }).pipe(
      mapParseError({
        code: 'executed-command-invalid',
        prefix: 'Invalid executed command row',
      }),
    ),
  );
  yield* applyExecutedCommandsTx(props.db, {
    inputs,
    aggregate,
    key: props.key,
  });
});
