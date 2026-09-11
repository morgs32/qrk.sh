import { aggregates, makeAggregateId, makeSelection, ZerospinError } from "@zerospin/sdk";
import { Effect } from "effect";

import { createGridV1 as createGrid } from "./contracts/createGrid/CreateGridV1";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updateGridV1 as updateGrid } from "./contracts/updateGrid/UpdateGridV1";
import { brickV1 as Brick } from "./models/brick/BrickV1";
import { gridV1 as Grid } from "./models/grid/GridV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { user } from "./user";

export const userV3 = aggregates.makeVersion(user, {
  version: "3.0.0",
  authorize: Effect.fn("user.authorize")(function* ({ aggregateId, userId }) {
    const expectedAggregateId = makeAggregateId({ id: userId });
    if (aggregateId !== expectedAggregateId) {
      return yield* new ZerospinError({
        code: "user-aggregate-mismatch",
        message: `Aggregate ${aggregateId} does not belong to user ${userId}`,
        status: 403,
      });
    }
  }),
  models: {
    brick: Brick,
    grid: Grid,
    page: Page,
    site: Site,
    user: User,
  },
  contracts: {
    createGrid: { contract: createGrid },
    createPage: { contract: createPage },
    createSite: { contract: createSite },
    createUser: { contract: createUser },
    updateGrid: { contract: updateGrid },
  },
  selections: {
    brick: makeSelection({
      model: Brick,
      where: ({ userId }: { userId: string }) => ({
        grid: {
          page: {
            site: {
              user: { clerkUserId: userId },
            },
          },
        },
      }),
    }),
    grid: makeSelection({
      model: Grid,
      where: ({ userId }: { userId: string }) => ({
        page: {
          site: {
            user: { clerkUserId: userId },
          },
        },
      }),
    }),
    page: makeSelection({
      model: Page,
      where: ({ userId }: { userId: string }) => ({
        site: {
          user: { clerkUserId: userId },
        },
      }),
    }),
    site: makeSelection({
      model: Site,
      where: ({ userId }: { userId: string }) => ({
        user: { clerkUserId: userId },
      }),
    }),
    user: makeSelection({
      model: User,
      where: ({ userId }: { userId: string }) => ({ clerkUserId: userId }),
    }),
  },
});
