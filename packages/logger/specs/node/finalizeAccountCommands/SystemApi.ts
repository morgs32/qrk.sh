import { makeTraceableRpcTarget } from '@zerospin/logger';
import { Effect } from 'effect';

import { systemWorker } from './SystemWorker.ts';

const wrappedSystemWorker = makeTraceableRpcTarget(systemWorker);

/** Originating SystemApi program — run under makeTelemetryLayer in the spec. */
export const finalizeAccountCommands = Effect.gen(function* () {
  return yield* wrappedSystemWorker
    .finalizeAccountBlock()
    .pipe(Effect.retry({ times: 5 }));
}).pipe(Effect.withSpan('SystemApi.finalizeAccountCommands'));
