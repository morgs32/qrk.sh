import { Effect } from 'effect';

declare function getFrontendController(props: {
  system: unknown;
  accountName: string;
  actorName: string;
}): Effect.Effect<{ id: string }, { code: string }>;

/**
 * Do not remap an error that already carries the domain code you want.
 *
 * @bad `.pipe(Effect.mapError(err => new DomainError({ code: 'frontend-not-found', cause: … })))` on `getFrontendController`.
 */
export const resolveFrontend = Effect.fn('resolveFrontend')(function* (props: {
  system: unknown;
  accountName: string;
  actorName: string;
}) {
  const { system, accountName, actorName } = props;

  const frontendController = yield* getFrontendController({
    system,
    accountName,
    actorName,
  });

  return frontendController;
});
