import * as sdk from "@zerospin/sdk/browser";
import { libraryModule } from "@qrk.sh/library/libraryModule";

import { upgradeAggregateContractVersion, prefixId } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV3 as Page } from "../../models/page/PageV3";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";

import { createPageV2 } from "./CreatePageV2";

export const createPageV3 = upgradeAggregateContractVersion(createPageV2, {
  operations: {
    createWall: libraryModule.models.wall.operations.create,
    createPage: Page.operations.create,
  },
  payload: {},
  up: Effect.fn("createPageV3.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("createPageV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site, user: User, page: Page, wall: libraryModule.models.wall },
  guard: Effect.fn("createPageV3.guard")(function* (props) {
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
  program: Effect.fn("createPageV3")(function* (props) {
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
  version: "3.0.0",
});
