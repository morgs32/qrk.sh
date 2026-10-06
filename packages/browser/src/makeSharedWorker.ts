import { Schema } from 'effect';

import { makeAggregateSharedWorker } from './AggregateNode/makeAggregateSharedWorker.ts';
import { makeServiceSharedWorker } from './ServiceNode/makeServiceSharedWorker.ts';
import { parseSharedWorkerName } from './sharedWorkerNames.ts';
/** One application entry dispatches to one concrete named worker runtime. */
export function makeSharedWorker({ sqliteWasmUrl }: { sqliteWasmUrl: string }) {
  const { name } = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String }),
  )(globalThis);
  const parsed = parseSharedWorkerName(name);
  const input = { sqliteWasmUrl, name, sessionKey: parsed.sessionKey };
  return parsed.kind === 'aggregate'
    ? makeAggregateSharedWorker(input)
    : makeServiceSharedWorker(input);
}
