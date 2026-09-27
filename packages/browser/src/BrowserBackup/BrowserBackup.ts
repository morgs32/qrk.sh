import {
  acquireBackupWorker,
  type IBackupWorker,
} from '@zerospin/backup-worker';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { Context, Effect, Layer, Scope } from 'effect';

const backupMemoMap = Layer.makeMemoMapUnsafe();

export class BrowserBackup extends Context.Service<
  BrowserBackup,
  {
    readonly claim: (props: {
      backupKey: string;
      session: object;
    }) => Effect.Effect<IBackupWorker, IAnyError, Scope.Scope>;
  }
>()('BrowserBackup') {
  private static readonly sharedLayer = Layer.effect(
    BrowserBackup,
    Effect.gen(function* () {
      const backupScope = yield* Effect.scope;
      const backupWorker = yield* Effect.cached(
        acquireBackupWorker().pipe(Scope.provide(backupScope)),
      );
      const claims = new Map<string, object>();

      return BrowserBackup.of({
        claim: Effect.fn('BrowserBackup.claim')(function* (props) {
          const owner = claims.get(props.backupKey);
          if (owner !== undefined && owner !== props.session) {
            return yield* Effect.fail(
              makeZerospinError({
                code: 'backup-key-already-owned',
                message:
                  'Another mounted session already claims this backup key in this browser context',
                extra: { backupKey: props.backupKey },
              }),
            );
          }

          claims.set(props.backupKey, props.session);
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              if (claims.get(props.backupKey) === props.session) {
                claims.delete(props.backupKey);
              }
            }),
          );

          return yield* backupWorker;
        }),
      });
    }),
  );

  static readonly layer = Layer.fromBuild((_, scope) =>
    Layer.buildWithMemoMap(BrowserBackup.sharedLayer, backupMemoMap, scope),
  );
}
