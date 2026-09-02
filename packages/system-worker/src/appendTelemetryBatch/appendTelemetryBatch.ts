import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
export const appendTelemetryBatch = Effect.fn(
  'SystemWorker.appendTelemetryBatch',
  { root: true },
)(function* (props: { batch: ITelemetryBatch }) {
  const systemLogRepo = yield* getSystemLogRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID },
  });
  return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
    systemLogRepo.appendTelemetryBatch({ batch: props.batch }),
  ).pipe(Effect.flatMap(decodeRpc));
});
