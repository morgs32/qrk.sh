import { defineAggregateContract } from "@zerospin/sdk/browser";
import { page as pageIdentity } from "@qrk.sh/bricks/zerospin/models/page/page";

import { site as siteIdentity } from "@qrk.sh/bricks/zerospin/models/site/site";

import * as sdk from "@zerospin/sdk/browser";

import {
  modelId,
  makeAggregateContractRelease,
  prefixId,
  primitives,
  ContractError,
} from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";

import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";

import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

const createPage = defineAggregateContract("createPage");

import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";

import { wallV1 as Wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";

export const createPageV1 = makeAggregateContractRelease(createPage, {
  claims: userClaims,
  operations: {
    createWall: Wall.operations.create,
    createPage: Page.operations.create,
  },
  payload: {
    id: modelId({ model: pageIdentity }),
    siteId: modelId({ model: siteIdentity }),
    slug: primitives.text({ nullable: true }),
    title: primitives.text({ nullable: true, defaultValue: null }),
    description: primitives.text({ nullable: true, defaultValue: null }),
  },
  failures: {
    createPagePathInvalid: ContractError.schema({ code: "create-page-path-invalid" }),
    createPagePathTaken: ContractError.schema({ code: "create-page-path-taken" }),
    createPageUserMismatch: ContractError.schema({ code: "create-page-user-mismatch" }),
    createPageSiteNotFound: ContractError.schema({ code: "create-page-site-not-found" }),
    createPageIndexTaken: ContractError.schema({ code: "create-page-index-taken" }),
  },
  models: {
    site: {
      model: Site,
      fields: [
        "hostname",
        "name",
        "createdAt",
        "updatedAt",
        "slug",
        "description",
        "isPublished",
        "userId",
        "logoUrl",
        "faviconLightUrl",
        "faviconDarkUrl",
        "stickyNavbar",
        "cardStyle",
        "brickGap",
      ],
    },
    user: { model: User, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
    page: {
      model: Page,
      fields: [
        "createdAt",
        "updatedAt",
        "siteId",
        "slug",
        "title",
        "description",
        "isPublished",
        "publishedSnapshotId",
      ],
    },
    wall: { model: Wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] },
  },
  guard: Effect.fn("createPageV1.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.createPageUserMismatch.make({
        message: "A Clerk user is required",
        status: 403,
      });
    }

    const site = yield* sdk.findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: payload.siteId } },
    });

    if (site === undefined) {
      return yield* failures.createPageSiteNotFound.make({
        message: `Site ${payload.siteId} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : yield* sdk.findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.createPageUserMismatch.make({
        message: `Site ${payload.siteId} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }

    if (payload.slug === null) {
      const indexPage = yield* sdk.findFirst({
        db,
        model: db.models.page,
        where: { siteId: { eq: payload.siteId }, slug: { isNull: true } },
      });

      if (indexPage !== undefined) {
        return yield* failures.createPageIndexTaken.make({
          message: `Site ${payload.siteId} already has an index page`,
          status: 409,
        });
      }
    }
    if (payload.slug !== null) {
      if (
        payload.slug
          .split("/")
          .some(
            (segment) =>
              segment === "" || segment === "." || segment === ".." || segment.includes("\\"),
          )
      )
        return yield* failures.createPagePathInvalid.make({
          message:
            "Page paths must contain nonempty segments other than . or .., without backslashes",
          status: 400,
        });
      const existing = yield* sdk.findFirst({
        db,
        model: db.models.page,
        where: { siteId: { eq: payload.siteId }, slug: { eq: payload.slug } },
      });
      if (existing !== undefined)
        return yield* failures.createPagePathTaken.make({
          message: `Site ${payload.siteId} already has a Page at ${payload.slug}`,
          status: 409,
        });
    }
  }),
  program: Effect.fn("createPageV1")(function* (props) {
    const { operations, payload } = props;
    const { id, siteId, slug, title, description } = payload;
    yield* operations.createPage({
      resourceId: id,
      attributes: {
        siteId,
        slug,
        title,
        description,
        isPublished: false,
        publishedSnapshotId: null,
      },
    });
    // Each Page starts with four independent empty layouts.
    const breakpoints: Array<"sm" | "md" | "lg" | "xl"> = ["sm", "md", "lg", "xl"];
    for (const breakpoint of breakpoints) {
      const wallId = prefixId(Wall, `${id}_${breakpoint}`);
      yield* operations.createWall({
        resourceId: wallId,
        attributes: {
          pageId: id,
          breakpoint,
          layout: { sections: [] },
        },
      });
    }
  }),
  version: 1,
});
