import { defineAggregateContract, findMany } from "@zerospin/sdk/browser";
import { pageV1 as Page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { wallV1 as Wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import { placementV1 as Placement } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import { brickV1 as Brick } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { measureWallFit, wallBreakpointWidths } from "@qrk.sh/bricks/zerospin/wall/wallSizing";
import { site as siteIdentity } from "@qrk.sh/bricks/zerospin/models/site/site";

import { ContractError } from "@zerospin/error";

import * as sdk from "@zerospin/sdk/browser";

import { modelId, makeAggregateContractRelease, primitives } from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";

import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

const updateSiteSettings = defineAggregateContract("updateSiteSettings");

const updateSiteSettingsPayload = {
  id: modelId({ model: siteIdentity }),
  name: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  logoUrl: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  faviconLightUrl: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  faviconDarkUrl: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const updateSiteSettingsV1 = makeAggregateContractRelease(updateSiteSettings, {
  operations: {
    updateSite: Site.operations.update,
  },
  failures: {
    updateSiteSettingsUserMismatch: ContractError.schema({
      code: "update-site-settings-user-mismatch",
    }),
    updateSiteSettingsNotFound: ContractError.schema({ code: "update-site-settings-not-found" }),
    siteBrickGapInvalid: ContractError.schema({ code: "site-brick-gap-invalid" }),
    siteLayoutOverflow: ContractError.schema({ code: "site-layout-overflow" }),
  },
  payload: {
    ...updateSiteSettingsPayload,
    cardStyle: primitives.boolean({ defaultValue: false }),
    brickGap: primitives.integer({ defaultValue: 1 }),
    stickyNavbar: primitives.boolean({ defaultValue: true }),
  },
  models: {
    user: User,
    site: Site,
    page: Page,
    wall: Wall,
    placement: Placement,
    brick: Brick,
  },
  guard: Effect.fn("updateSiteSettingsV1.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: "Updating site settings requires an authenticated user",
        status: 403,
      });
    }

    const site = yield* sdk.findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: payload.id } },
    });

    if (site === undefined) {
      return yield* failures.updateSiteSettingsNotFound.make({
        message: `Site ${payload.id} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : yield* sdk.findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: `Site ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }

    if (payload.brickGap < 0 || payload.brickGap > 12) {
      return yield* failures.siteBrickGapInvalid.make({
        message: "Brick gap must be a whole number from 0 to 12 pixels",
        status: 400,
      });
    }
  }),
  program: Effect.fn("updateSiteSettingsV1")(function* (props) {
    const { db, operations, payload, failures } = props;
    const pages = yield* findMany({
      db,
      model: db.models.page,
      where: { siteId: { eq: payload.id } },
    });
    const walls =
      pages.length === 0
        ? []
        : yield* findMany({
            db,
            model: db.models.wall,
            where: { pageId: { in: pages.map((entry) => entry.id) } },
          });
    const placements =
      walls.length === 0
        ? []
        : yield* findMany({
            db,
            model: db.models.placement,
            where: { wallId: { in: walls.map((entry) => entry.id) } },
            with: { brick: true },
          });
    for (const currentWall of walls) {
      const wallPlacements = placements.filter((entry) => entry.wallId === currentWall.id);
      if (wallPlacements.some((entry) => entry.brick.pageId !== currentWall.pageId))
        throw new Error("The Wall contains a Placement from another Page");
      const fit = measureWallFit({
        layout: currentWall.layout,
        placementMinimumWidths: new Map(
          wallPlacements.map((entry) => [
            entry.id,
            backendLibrary[entry.brick.moduleId].variants.default.minWidth,
          ]),
        ),
        wallWidth: wallBreakpointWidths[currentWall.breakpoint],
        brickGap: payload.brickGap,
      });
      if (fit.some((section) => !section.fits))
        return yield* failures.siteLayoutOverflow.make({
          message: "Not enough space in this Section",
          status: 409,
        });
    }
    yield* operations.updateSite({
      resourceId: payload.id,
      attributes: {
        name: payload.name,
        description: payload.description,
        logoUrl: payload.logoUrl,
        faviconLightUrl: payload.faviconLightUrl,
        faviconDarkUrl: payload.faviconDarkUrl,
        cardStyle: payload.cardStyle,
        brickGap: payload.brickGap,
        stickyNavbar: payload.stickyNavbar,
      },
    });
  }),
  version: 1,
});
