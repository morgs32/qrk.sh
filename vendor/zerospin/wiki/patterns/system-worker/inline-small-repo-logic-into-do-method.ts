import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { Context, Effect } from 'effect';

class RepoDb extends Context.Service<RepoDb, IDb>()('RepoDb') {
  static readonly Tx = Context.Service<'RepoDb.Tx', ITx>('RepoDb.Tx');
}

/**
 * Inline non-public one-consumer Repo logic into the owning public method file.
 *
 * @bad Create `shared/applyOneCommand.ts` for a helper called once.
 * @bad Add a module-level helper above the public method when its only caller is that method.
 * @bad Inline a public system-worker Repo RPC method back into the class file.
 */
export const execute = Effect.fn('VersionedAggregateRepo.execute')(
  function* (props: { command: unknown; db: IDb }) {
    return yield* makeTx(
      'VersionedAggregateRepo.execute.transaction',
      RepoDb,
    )(function* () {
      const tx = yield* RepoDb.Tx;
      return yield* applyCommandTx({ command: props.command, tx });
    })().pipe(Effect.provideService(RepoDb, props.db));
  },
);

export class VersionedAggregateRepo {
  async execute(props: { command: unknown }) {
    return managedRuntime.runPromise(
      execute({ command: props.command, db: this.db }).pipe(encodeRpc),
    );
  }

  declare db: IDb;
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const applyCommandTx: (props: {
  command: unknown;
  tx: ITx;
}) => Effect.Effect<unknown>;
declare const encodeRpc: (effect: unknown) => unknown;
