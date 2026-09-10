import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';
/*
 * Linked worker RPC handlers persist their collected telemetry through the
 * deployment SystemLogRepo. Callers decide whether persistence success permits
 * a trace link in their response.
 *
 * 1. Resolve the deployment telemetry owner.
 * 2. Persist and decode the batch acknowledgement.
 */
export const appendTelemetryBatch = Effect.fn(
  'SystemWorker.appendTelemetryBatch',
  { root: true },
)(function* (props: { batch: ITelemetryBatch }) {
  const { batch } = props;

  // 1 — use ZEROSPIN_SYSTEM_ID for SystemLogRepo lookup
  const systemLogRepo = yield* SystemLogRepo.getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID },
  });

  // 2 — forward the complete batch to SystemLogRepo.appendTelemetryBatch
  return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
    systemLogRepo.appendTelemetryBatch({ batch }),
  ).pipe(Effect.flatMap(decodeRpc));
});
