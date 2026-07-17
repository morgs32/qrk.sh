import {
  makeRpcHandler,
  makeTraceableRpcTarget,
  type IRpcRequest,
} from '@zerospin/logger';
import { DurableObject, env } from 'cloudflare:workers';
import { Effect } from 'effect';

// The account boundary is a real Durable Object. Its outbound publish call is
// made through a Durable Object stub rather than the Node fixture object.
export class AccountRepo extends DurableObject {
  async finalizeAccountBlock(request: IRpcRequest<[]>) {
    const wrappedAccountBlockRepo = makeTraceableRpcTarget(
      env.ACCOUNT_BLOCK_REPO.getByName('account-block'),
    );

    return Effect.runPromise(
      makeRpcHandler('AccountRepo.finalizeAccountBlock')(function* () {
        yield* Effect.logInfo('finalizing 2 account commands');
        yield* Effect.void.pipe(
          Effect.withSpan('AccountRepo.prepareAccountCommands'),
        );
        yield* Effect.gen(function* () {
          yield* Effect.void.pipe(
            Effect.withSpan('AccountRepo.finalizeCommandsTx'),
          );
          yield* Effect.void.pipe(
            Effect.withSpan('AccountRepo.makeAccountBlockTx'),
          );
          yield* Effect.void.pipe(
            Effect.withSpan('AccountRepo.upsertAccountBlockTx'),
          );
        }).pipe(
          Effect.withSpan('AccountRepo.finalizeAccountBlock.transaction'),
        );

        yield* wrappedAccountBlockRepo
          .publish()
          .pipe(
            Effect.retry({ times: 3 }),
            Effect.withSpan('AccountRepo.publishAccountBlock'),
          );

        yield* Effect.void.pipe(
          Effect.withSpan('AccountRepo.upsertAccountBlock'),
        );
        return { executed: 2, failed: 0 };
      })(request),
    );
  }
}
