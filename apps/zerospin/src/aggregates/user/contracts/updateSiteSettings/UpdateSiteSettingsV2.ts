import { findMany, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { ContractError } from "@zerospin/error";
import { Effect } from "effect";
import { updateSiteSettingsV1 } from "./UpdateSiteSettingsV1";
import { pageV1 as page } from "../../models/page/PageV1";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { brickV2 as brick } from "../../models/brick/BrickV2";
import { siteV1 as site } from "../../models/site/SiteV1";
import { backendLibrary } from "@qrk.sh/bricks/definition/backendLibrary";
import { measureWallFit, wallBreakpointWidths } from "../../layout/wallSizing";

export const updateSiteSettingsV2 = upgradeAggregateContractRelease(updateSiteSettingsV1, {
  version: 2,
  payload: {},
  models: { page, wall, placement, brick },
  operations: { updateSite: site.operations.update },
  failures: {
    siteLayoutOverflow: ContractError.schema({ code: "site-layout-overflow" }),
  },
  program: Effect.fn("updateSiteSettingsV2")(function* (props) {
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
            backendLibrary[entry.brick.moduleId].variants[entry.variantId].minWidth,
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
});
