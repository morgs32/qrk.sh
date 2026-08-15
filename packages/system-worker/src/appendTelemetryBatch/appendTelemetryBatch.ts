import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { ITelemetryBatch } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { getSystemLogRepo } from '../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const appendTelemetryBatch = Effect.fn(
  'SystemWorker.appendTelemetryBatch',
  { root: true },
)(function* (props: { batch: ITelemetryBatch; generationId: string }) {
  yield* makeAsync(() =>
    SystemRepo.getRepo({
      systemId: env.ZEROSPIN_SYSTEM_ID,
    }).assertGenerationAdmission({
      generationId: props.generationId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const systemLogRepo = yield* getSystemLogRepo({
    key: { generationId: props.generationId },
  });
  return yield* makeAsync(() =>
    systemLogRepo.appendTelemetryBatch({ batch: props.batch }),
  ).pipe(Effect.flatMap(decodeRpc));
});
