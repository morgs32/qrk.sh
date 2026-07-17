import { Effect } from 'effect';

declare function getFrontendController(props: {
  system: unknown;
  accountName: string;
  actorName: string;
}): Effect.Effect<{ id: string }, unknown>;

/**
 * Named frontend lookup goes through `getFrontendController` — not stale map indexing + throw.
 *
 * @bad `const frontend = frontends[actorName]; if (!frontend) throw new DomainError(...)`.
 */
export const loadFrontend = Effect.fn('loadFrontend')(function* (props: {
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
