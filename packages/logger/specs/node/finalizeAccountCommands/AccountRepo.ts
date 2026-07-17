import { makeRpcHandler, makeTraceableRpcTarget } from '@zerospin/logger';
import { Effect } from 'effect';

import { accountBlockRepo } from './AccountBlockRepo.ts';

const wrappedAccountBlockRepo = makeTraceableRpcTarget(accountBlockRepo);

const finalizeAccountBlockHandler = makeRpcHandler(
  'AccountRepo.finalizeAccountBlock',
)(function* () {
  yield* Effect.logInfo('finalizing 2 account commands');
  yield* Effect.void.pipe(
    Effect.withSpan('AccountRepo.prepareAccountCommands'),
  );
  yield* Effect.gen(function* () {
    yield* Effect.void.pipe(Effect.withSpan('AccountRepo.finalizeCommandsTx'));
    yield* Effect.void.pipe(Effect.withSpan('AccountRepo.makeAccountBlockTx'));
    yield* Effect.void.pipe(
      Effect.withSpan('AccountRepo.upsertAccountBlockTx'),
    );
  }).pipe(Effect.withSpan('AccountRepo.finalizeAccountBlock.transaction'));

  yield* wrappedAccountBlockRepo
    .publish()
    .pipe(
      Effect.retry({ times: 3 }),
      Effect.withSpan('AccountRepo.publishAccountBlock'),
    );

  yield* Effect.void.pipe(Effect.withSpan('AccountRepo.upsertAccountBlock'));
  return { executed: 2, failed: 0 };
});

export const accountRepo = {
  finalizeAccountBlock: (
    request: Parameters<typeof finalizeAccountBlockHandler>[0],
  ) => Effect.runPromise(finalizeAccountBlockHandler(request)),
};
