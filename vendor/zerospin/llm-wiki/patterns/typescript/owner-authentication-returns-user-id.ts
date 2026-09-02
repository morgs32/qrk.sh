import { Effect, Schema } from 'effect';

/**
 * An aggregate owner authenticates every one of its frontends and returns only userId.
 *
 * @bad Return aggregateName or aggregateId from authentication; admission already owns that coordinate.
 * @bad Add a separate authored authorize callback after successful authentication.
 * @bad Add actorName to authentication.
 */
export const system = makeSystem({
  name: 'shopping',
  version: '1.0.0',
  aggregates: {
    shopper: {
      userId: Schema.NonEmptyString,
      authenticate: (props: {
        frontendName: 'web';
        signature: { accessToken: string };
        db: {
          query: {
            user: {
              findFirst(props: unknown): Promise<{ userId: string }>;
            };
          };
        };
      }) =>
        Effect.fn('shopper.authenticate')(function* () {
          const user = yield* Effect.promise(() =>
            props.db.query.user.findFirst({
              where: { accessToken: props.signature.accessToken },
            }),
          );
          return user.userId;
        }),
      models,
      contracts: {},
      selections: {},
      frontends: {
        web: {
          controller: web,
        },
      },
    },
  },
  services: {},
});

declare const models: { user: unknown };
declare const web: unknown;
declare function makeSystem(props: unknown): unknown;
