import { usernameStatusV1 } from "@qrk.sh/bricks/zerospin/models/usernameStatus/UsernameStatusV1";
import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { findFirst, primitives, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { createSiteV1 } from "./CreateSiteV1";

export const createSiteV2 = upgradeAggregateContractRelease(createSiteV1, {
  version: 2,
  payload: { slug: primitives.text({ nullable: true }) },
  models: { usernameStatus: { model: usernameStatusV1, fields: ["userId", "pending"] } },
  operations: { createSite: siteV2.operations.create },
  up: (props) => {
    const { payload } = props;
    return Effect.succeed(payload);
  },
  down: (props) => {
    const { payload } = props;
    const legacySlug =
      payload.slug ??
      `site-${payload.id
        .split("")
        .map((character) => character.charCodeAt(0).toString(16).padStart(4, "0"))
        .join("")}`;
    return Effect.succeed({ ...payload, slug: legacySlug });
  },
  guard: Effect.fn("createSiteV2.guard")(function* (props) {
    const { command, payload, claims, db, failures } = props;
    if (typeof claims?.clerkUserId !== "string") {
      return yield* failures.createSiteUserMismatch.make({
        message: "Creating a Site requires an authenticated user",
        status: 403,
      });
    }
    const owner = yield* findFirst({
      db,
      model: db.models.user,
      where: { id: { eq: payload.userId }, clerkUserId: { eq: claims.clerkUserId } },
    });
    if (owner === undefined) {
      return yield* failures.createSiteUserMismatch.make({
        message: "Creating a Site requires the owning user",
        status: 403,
      });
    }
    if (command.contractVersion < 2) return;
    if (owner.username === null || owner.username === "") {
      return yield* failures.createSiteUserMismatch.make({
        message: "Save a username before creating a Site",
        status: 403,
      });
    }
    const status = yield* findFirst({
      db,
      model: db.models.usernameStatus,
      where: { userId: { eq: owner.id } },
    });
    if (status?.pending !== null && status?.pending !== undefined) {
      return yield* failures.createSiteUserMismatch.make({
        message: "Wait for your username to be saved",
        status: 409,
      });
    }
  }),
  program: Effect.fn("createSiteV2")(function* (props) {
    const { operations, failures, payload, claims } = props;
    if (typeof claims?.clerkUserId !== "string") {
      return yield* failures.createSiteUserMismatch.make({
        message: "Creating a site requires an authenticated user",
        status: 403,
      });
    }
    const { id, userId, slug, name, description } = payload;
    yield* operations.createSite({
      resourceId: id,
      attributes: {
        userId,
        slug,
        name,
        description,
        hostname: null,
        logoUrl: null,
        faviconLightUrl: null,
        faviconDarkUrl: null,
        isPublished: false,
        cardStyle: false,
        brickGap: 0,
        stickyNavbar: true,
      },
    });
  }),
});
