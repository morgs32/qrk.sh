import { page as pageIdentity } from "../../models/page/page";

import { site as siteIdentity } from "../../models/site/site";

import * as sdk from "@zerospin/sdk/browser";

import {
  modelId,
  makeAggregateContractVersion,
  prefixId,
  primitives,
  ContractError,
} from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { pageV1 as Page } from "../../models/page/PageV1";

import { siteV1 as Site } from "../../models/site/SiteV1";

import { userV1 as User } from "../../models/user/UserV1";

import { createPage } from "./createPage";

import { userClaims } from "../../../../claims";

import { wallV1 as Wall } from "../../models/wall/WallV1";

import { sectionV1 as Section } from "../../models/section/SectionV1";

import { stackV1 as Stack } from "../../models/stack/StackV1";

export const createPageV1 = makeAggregateContractVersion(createPage, {
  claims: userClaims,
  operations: {
    createWall: Wall.operations.create,
    createSection: Section.operations.create,
    createStack: Stack.operations.create,
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
    createPageUserMismatch: ContractError.schema({ code: "create-page-user-mismatch" }),
    createPageSiteNotFound: ContractError.schema({ code: "create-page-site-not-found" }),
    createPageIndexTaken: ContractError.schema({ code: "create-page-index-taken" }),
  },
  models: { site: Site, user: User, page: Page, wall: Wall, section: Section, stack: Stack },
  guard: Effect.fn("createPageV1.guard")(function* (props) {
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
      const sectionId = prefixId(Section, `${id}_${breakpoint}`);
      yield* operations.createWall({ resourceId: wallId, attributes: { pageId: id, breakpoint } });
      yield* operations.createSection({
        resourceId: sectionId,
        attributes: { wallId, position: 0 },
      });
      yield* operations.createStack({
        resourceId: prefixId(Stack, `${id}_${breakpoint}`),
        attributes: { sectionId, name: "Stack", position: 0 },
      });
    }
  }),
  version: 1,
});
