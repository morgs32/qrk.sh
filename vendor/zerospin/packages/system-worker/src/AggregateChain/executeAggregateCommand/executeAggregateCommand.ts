import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import config from 'config';
import { Effect } from 'effect';

import { AggregateVersionRepo } from '../../AggregateVersionRepo/AggregateVersionRepo.js';
import { admitCommands } from '../admitCommands/admitCommands.js';

const { system } = config;

/** Admit once and recover the explicitly selected materializer result. */
export const executeAggregateCommand = Effect.fn(
  'AggregateChain.executeAggregateCommand',
)(function* (props: {
  aggregateVersion: string;
  automationOutput?: boolean;
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
  const repo = yield* AggregateVersionRepo.getRepo({
    key: { ...props.key, aggregateVersion },
  });

  // 4 — execute through receipt.aggregateIndex and decode its terminal result
  return yield* makeAsync<Awaited<ReturnType<AggregateVersionRepo['execute']>>>(
    () => repo.execute({ aggregateIndex: receipt!.aggregateIndex }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
});
