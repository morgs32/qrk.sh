import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeAbbreviationIdSchema } from "@zerospin/schema";
import { contracts, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
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

export const createUserV1 = contracts.makeVersion(createUser, {
  payload: createUserPayload,
  models: { user: User },
  guard: Effect.fn("createUser.guard")(function* ({
    userId,
    payload,
  }: {
    userId: string | null;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<{ user: typeof User }, Record<never, never>>>, "query">
    >;
    payload: InferCommandPayload<typeof createUserPayload>;
  }) {
    if (userId === null || payload.id !== User.prefixId(userId) || payload.clerkUserId !== userId) {
      return yield* new ZerospinError({
        code: "create-user-identity-mismatch",
        message: `User ${payload.id} does not match authenticated user ${userId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) => {
    const { id, clerkUserId, username, displayName } = payload;
    return Effect.all({
      created: models.user.create({
        resourceId: id,
        attributes: {
          actorId: Schema.decodeUnknownSync(makeAbbreviationIdSchema("actr"))(
            `actr_${clerkUserId}`,
          ),
          clerkUserId,
          username,
          displayName,
        },
      }),
    });
  },
  version: "1.0.0",
});
