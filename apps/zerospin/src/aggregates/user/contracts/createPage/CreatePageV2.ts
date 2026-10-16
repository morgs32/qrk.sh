import { ContractError } from "@zerospin/error";
import * as sdk from "@zerospin/sdk/browser";
import { libraryModule } from "@qrk.sh/library/libraryModule";

import { upgradeAggregateContractVersion, prefixId } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV2 as Page } from "../../models/page/PageV2";
import { siteV2 as Site } from "../../models/site/SiteV2";
import { userV1 as User } from "../../models/user/UserV1";

import { createPageV1 } from "./CreatePageV1";

export const createPageV2 = upgradeAggregateContractVersion(createPageV1, {
  operations: {
    createWall: libraryModule.models.wall.operations.create,
    createPage: Page.operations.create,
  },
  failures: {
    createPageUserMismatch: ContractError.schema({ code: "create-page-user-mismatch" }),
    createPageSiteNotFound: ContractError.schema({ code: "create-page-site-not-found" }),
    createPageIndexTaken: ContractError.schema({ code: "create-page-index-taken" }),
  },

  payload: {},
  up: Effect.fn("createPageV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("createPageV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site, user: User, page: Page, wall: libraryModule.models.wall },
  guard: Effect.fn("createPageV2.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
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

    if (payload.slug === null) {
      const indexPage = yield* sdk.findFirst({
        db,
        model: Page,
        where: { siteId: { eq: payload.siteId }, slug: { isNull: true } },
      });

      if (indexPage !== undefined) {
        return yield* failures.createPageIndexTaken.make({
          message: `Site ${payload.siteId} already has an index page`,
          status: 409,
        });
      }
    }
  }),
  program: Effect.fn("createPageV2")(function* (props) {
    const { operations, payload } = props;
    const { id, siteId, slug, title, description } = payload;
    // Create the wall before the page that references it in the same command.
    const wallId = prefixId(libraryModule.models.wall, id);
    yield* operations.createWall({
      resourceId: wallId,
      attributes: { label: "Library" },
    });
    yield* operations.createPage({
      resourceId: id,
      attributes: {
        wallId,
        siteId,
        slug,
        title,
        description,
        isPublished: false,
        publishedSnapshotId: null,
      },
    });
  }),
  version: "2.0.0",
});
