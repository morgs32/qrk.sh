import { ContractError } from "@zerospin/error";
import * as sdk from "@zerospin/sdk/browser";
import { libraryModule } from "@qrk.sh/library/libraryModule";

import { makeAggregateContractVersion, prefixId, primitives } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { pageV1 as Page } from "../../models/page/PageV1";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { createPage } from "./createPage";

const createPagePayload = {
  id: primitives.foreignKey({ abbreviation: Page.abbreviation }),
  siteId: primitives.foreignKey({ abbreviation: Site.abbreviation }),
  slug: primitives.text(),
  title: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const createPageV1 = makeAggregateContractVersion(createPage, {
  operations: Schema.Array(
    Schema.Union([libraryModule.models.wall.operations.create, Page.operations.create]),
  ),
  failures: {
    createPageUserMismatch: ContractError.schema({ code: "create-page-user-mismatch" }),
    createPageSiteNotFound: ContractError.schema({ code: "create-page-site-not-found" }),
  },

  payload: createPagePayload,
  models: { site: Site, user: User, page: Page, wall: libraryModule.models.wall },
  guard: (props) => {
    const { failures, claims, db, payload } = props;
    return Effect.gen(function* () {
      const clerkUserId = claims?.clerkUserId;
      if (typeof clerkUserId !== "string") {
        return yield* failures.createPageUserMismatch.make({
          message: "A Clerk user is required",
          status: 403,
        });
      }

      const site = yield* sdk.findFirst({ db, model: Site, where: { id: { eq: payload.siteId } } });

      if (site === undefined) {
        return yield* failures.createPageSiteNotFound.make({
          message: `Site ${payload.siteId} was not found`,
          status: 404,
        });
      }

      const user =
        site.userId === null
          ? undefined
          : yield* sdk.findFirst({ db, model: User, where: { id: { eq: site.userId } } });

      if (user === undefined || user.clerkUserId !== clerkUserId) {
        return yield* failures.createPageUserMismatch.make({
          message: `Site ${payload.siteId} does not belong to identity ${clerkUserId}`,
          status: 403,
        });
      }
    });
  },
  program: (props) => {
    const { payload } = props;
    return Effect.gen(function* () {
      const { id, siteId, slug, title, description } = payload;
      // Create the wall before the page that references it in the same command.
      const wallId = prefixId(libraryModule.models.wall, id);
      const wall = yield* sdk.makeCreateOperation({
        model: libraryModule.models.wall,
        resourceId: wallId,
        attributes: { label: "Library" },
      });
      const page = yield* sdk.makeCreateOperation({
        model: Page,
        resourceId: id,
        attributes: { wallId, siteId, slug, title, description },
      });
      return { operations: [wall, page], result: undefined };
    });
  },
  version: "1.0.0",
});
