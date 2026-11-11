import { brickV2 as brick } from "../../models/brick/BrickV2";
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { measureWallFit, wallBreakpointWidths } from "../../layout/wallSizing";
import {
  upgradeAggregateContractRelease,
  findFirst,
  findMany,
  prefixId,
} from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { moveStackV2 } from "./MoveStackContractV2";
import { moveStackInLayout } from "../../layout/wallLayoutV3";

export const moveStackV3 = upgradeAggregateContractRelease(moveStackV2, {
  version: 3,
  payload: {},
  models: { wall, placement, brick },
  operations: { updateWall: wall.operations.update },
  program: Effect.fn("moveStack.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { target } = payload;
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: target.wallId } },
    });
    if (
      wallRow === undefined ||
      !wallRow.layout.sections.some((entry) =>
        entry.stacks.some((entry) => entry.id === payload.stackId),
      )
    )
      return yield* failures.invalidLayout.make({
        message: "Stacks can only move within their Wall",
        status: 409,
      });
    const pageId = wallRow.pageId;
    const pageRow = yield* findFirst({ db, model: db.models.page, where: { id: { eq: pageId } } });
    const siteRow =
      pageRow === undefined || pageRow.siteId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined || siteRow.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
    if (
      siteRow === undefined ||
      userRow === undefined ||
      userRow.clerkUserId !== claims?.clerkUserId
    )
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const changed = moveStackInLayout({
      layout: wallRow.layout,
      target,
      stackId: payload.stackId,
      newSectionId: prefixId({ abbreviation: "sec" }, payload.id),
    });
    if (Result.isFailure(changed))
      return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
    if (changed.success === wallRow.layout) return;
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { wallId: { eq: wallRow.id } },
      with: { brick: true },
    });
    if (placements.some((entry) => entry.brick.pageId !== wallRow.pageId))
      throw new Error("The Wall contains a Placement from another Page");
    const fit = measureWallFit({
      layout: changed.success,
      placementMinimumWidths: new Map(
        placements.map((entry) => [
          entry.id,
          backendLibrary[entry.brick.moduleId].variants[entry.variantId].minWidth,
        ]),
      ),
      wallWidth: wallBreakpointWidths[wallRow.breakpoint],
      brickGap: siteRow.brickGap,
    });
    if (fit.some((section) => !section.fits))
      return yield* failures.invalidLayout.make({
        message: "Not enough space in this Section",
        status: 409,
      });

    yield* operations.updateWall({
      resourceId: wallRow.id,
      attributes: { layout: changed.success },
    });
  }),
});
