import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { userV1 as User } from "../../models/user/UserV1";

import { createUser } from "./createUser";

const createUserPayload = {
  id: primitives.foreignKey({ abbreviation: User.abbreviation }),
  clerkUserId: primitives.text(),
  username: primitives.text({
    nullable: true,
  }),
  displayName: primitives.text({
    nullable: true,
  }),
};

export const createUserV1 = makeContractVersion(createUser, {
  payload: createUserPayload,
  models: { user: User },
  guard: Effect.fn("createUser.guard")(function* ({
    authentication,
    payload,
    db,
  }: {
    authentication: Readonly<Record<string, unknown>> | null;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<{ user: typeof User }, Record<never, never>>>, "query">
    >;
    payload: InferCommandPayload<typeof createUserPayload>;
  }) {
    const clerkUserId = authentication?.clerkUserId;

    if (authentication !== null && payload.clerkUserId !== clerkUserId) {
      return yield* new ZerospinError({
        code: "create-user-identity-mismatch",
        message: `User ${payload.id} does not match authenticated identity ${clerkUserId}`,
        status: 403,
      });
    }

    const user = db.query.user
      .findFirst({
        where: { clerkUserId: { eq: payload.clerkUserId } },
      })
      .sync();

    if (user !== undefined) {
      return yield* new ZerospinError({
        code: "user-already-exists",
        message: `A user already exists for Clerk user ${payload.clerkUserId}`,
        status: 409,
      });
    }
  }),
  program: ({ payload, models }) => {
    const { id, clerkUserId, username, displayName } = payload;
    return Effect.all({
      created: models.user.create({
        resourceId: id,
        attributes: {
          clerkUserId,
          username,
          displayName,
        },
      }),
    });
  },
  version: "1.0.0",
});
