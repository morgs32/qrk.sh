import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { Effect } from 'effect';
import { system } from 'system';

import { VersionedAggregateRepo } from '../../VersionedAggregateRepo/VersionedAggregateRepo.js';
import { admitCommands } from '../admitCommands/admitCommands.js';

/** Admit once and recover the explicitly selected materializer result. */
export const executeAggregateCommand = Effect.fn(
  'AggregateChain.executeAggregateCommand',
)(function* (props: {
  aggregateVersion: string;
  command: Parameters<typeof admitCommands>[0]['commands'][number];
  db: Parameters<typeof admitCommands>[0]['db'];
  key: Parameters<typeof admitCommands>[0]['key'];
}) {
  // 1 — reuse admitCommands idempotency and its assigned aggregateIndex
  const aggregateVersion = props.aggregateVersion;
  yield* getByKeyOrThrow({
    record: system.aggregates[props.key.aggregateName] ?? {},
    key: aggregateVersion,
    recordKind: 'aggregate versions',
  });
  const [receipt] = yield* admitCommands({
    ...props,
    commands: [props.command],
  });

  // Selection remains explicit on retries.

  // 3 — extend the admitted-chain key with aggregateVersion
  const repo = yield* VersionedAggregateRepo.getRepo({
    key: { ...props.key, aggregateVersion },
  });

  // 4 — execute through receipt.aggregateIndex and decode its terminal result
  return yield* makeAsync<
    Awaited<ReturnType<VersionedAggregateRepo['execute']>>
  >(() => repo.execute({ aggregateIndex: receipt!.aggregateIndex })).pipe(
    Effect.flatMap(decodeRpc),
  );
});
