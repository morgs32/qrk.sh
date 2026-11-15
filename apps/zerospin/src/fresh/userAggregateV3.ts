import { defineAggregate, findFirst, makeAggregateRelease } from "@zerospin/sdk";
import { Effect } from "effect";

import { createUserV1 } from "./contracts/CreateUserV1";
import { userActorV2 } from "./userActorV2";
import { userAggregateV1 } from "./userAggregateV1";

export const userAggregateV3 = makeAggregateRelease(defineAggregate({ name: "user" }), {
  version: 3,
  models: userAggregateV1.models,
  system: { createUser: createUserV1 },
  external: {},
  actors: { web: userActorV2 },
  guards: {
    web: {
      createPage: Effect.fn("userV3.createPage.guard")(function* (props) {
        const { db, payload, claims, failures } = props;
        if (payload.slug === null) return;

        if (payload.slug.split("/").some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("\\"))) {
          return yield* failures.createPagePathInvalid.make({
            message: "Page paths must contain nonempty segments other than . or .., without backslashes",
            status: 400,
          });
        }

        const existing = yield* findFirst({
          db,
          model: db.models.page,
          where: {
            siteId: { eq: payload.siteId },
            slug: { eq: payload.slug },
            site: { user: { clerkUserId: { eq: claims.clerkUserId } } },
          },
        });
        if (existing !== undefined) {
          return yield* failures.createPagePathTaken.make({
            message: `Site ${payload.siteId} already has a Page at ${payload.slug}`,
            status: 409,
          });
        }
      }),
    },
  },
});
