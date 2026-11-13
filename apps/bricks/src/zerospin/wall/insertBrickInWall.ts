import type { IContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import type { IRecordingOperations } from "@zerospin/core/contracts/operationDescriptor";
import { ContractError, findFirst, findMany, prefixId, type IInferResource } from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { backendLibrary } from "../../modules/backendLibrary";
import { brickV1 } from "../models/brick/BrickV1";
import { pageV1 } from "../models/page/PageV1";
import { placementV1 } from "../models/placement/PlacementV1";
import { siteV1 } from "../models/site/SiteV1";
import { userV1 } from "../models/user/UserV1";
import { wallV1 } from "../models/wall/WallV1";
import { canShareRow } from "./canShareRow";
import { insertPlacementInLayout } from "./insertPlacementInLayout";
import { makePlacementId } from "./makePlacementId";
import type { wallInsertionTargetSchema } from "./wallInsertionTargetSchema";
import { measureWallFit, wallBreakpointWidths } from "./wallSizing";

export const wallInsertionFailure = ContractError.schema({ code: "wall-insertion-invalid" });

/** Record the four breakpoint Placements and their Wall layouts in the invoking command. */
export const insertBrickInWall = Effect.fn("insertBrickInWall")(function* (props: {
  db: IContractReadDb<{
    page: typeof pageV1;
    site: typeof siteV1;
    user: typeof userV1;
    wall: typeof wallV1;
    brick: typeof brickV1;
    placement: typeof placementV1;
  }>;
  operations: IRecordingOperations<{
    updateWall: typeof wallV1.operations.update;
    createPlacement: typeof placementV1.operations.create;
  }>;
  claims: { clerkUserId: string } | null;
  brickId: IInferResource<typeof brickV1>["id"];
  pageId: IInferResource<typeof pageV1>["id"];
  target: typeof wallInsertionTargetSchema.Type;
  module: {
    id: IInferResource<typeof brickV1>["moduleId"];
    maxPerPage: number | undefined;
    variants: { default: { defaultHeight: number | null; defaultWidth: number; minWidth: number } };
  };
  layoutId: string;
  placementState: unknown;
}) {
  const { db, operations, claims, brickId, pageId, target, module, layoutId, placementState } = props;
  const pageRow = yield* findFirst({ db, model: db.models.page, where: { id: { eq: pageId } } });
  const siteRow =
    pageRow === undefined || pageRow.siteId === null
      ? undefined
      : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
  const userRow =
    siteRow === undefined || siteRow.userId === null
      ? undefined
      : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
  if (siteRow === undefined || userRow === undefined || userRow.clerkUserId !== claims?.clerkUserId)
    return yield* wallInsertionFailure.make({ message: "This Page is unavailable", status: 403 });

  const walls = yield* findMany({ db, model: db.models.wall, where: { pageId: { eq: pageId } } });
  const activeWall = walls.find((entry) => entry.id === target.wallId);
  if (activeWall === undefined)
    return yield* wallInsertionFailure.make({ message: "The Wall does not belong to this Page", status: 409 });
  if (walls.length !== 4)
    return yield* wallInsertionFailure.make({ message: "A Page requires all four breakpoint Walls", status: 409 });

  const existingBricks = yield* findMany({ db, model: db.models.brick, where: { pageId: { eq: pageId } } });
  if (existingBricks.some((entry) => entry.id === brickId))
    return yield* wallInsertionFailure.make({ message: "This Brick already exists", status: 409 });
  if (module.maxPerPage !== undefined && existingBricks.filter((entry) => entry.moduleId === module.id).length >= module.maxPerPage)
    return yield* wallInsertionFailure.make({ message: "This module has reached its Page limit", status: 409 });

  const activeChange = insertPlacementInLayout({
    layout: activeWall.layout,
    target,
    placementId: makePlacementId(brickId, activeWall.breakpoint),
    newNodeIds: {
      sectionId: prefixId({ abbreviation: "sec" }, `${brickId}_${activeWall.id}`),
      stackId: prefixId({ abbreviation: "stk" }, `${brickId}_${activeWall.id}`),
      rowId: prefixId({ abbreviation: "row" }, `${brickId}_${activeWall.id}`),
    },
  });
  if (Result.isFailure(activeChange))
    return yield* wallInsertionFailure.make({ message: activeChange.failure, status: 409 });

  if (target.kind === "row") {
    const destination = activeWall.layout.sections.flatMap((entry) => entry.stacks).flatMap((entry) => entry.rows).find((entry) => entry.id === target.rowId);
    if (destination !== undefined) {
      const existingPlacements = yield* findMany({
        db,
        model: db.models.placement,
        where: { wallId: { eq: activeWall.id }, id: { in: destination.placementIds } },
        with: { brick: true },
      });
      if (existingPlacements.length !== destination.placementIds.length || existingPlacements.some((entry) => entry.brick.pageId !== pageId))
        throw new Error("The Row contains a Placement missing from its Wall");
      if (!canShareRow({ incomingVariant: module.variants.default, existingVariants: existingPlacements.map((entry) => backendLibrary[entry.brick.moduleId].variants.default) }))
        return yield* wallInsertionFailure.make({ message: "Variable-height Bricks require their own Row", status: 409 });
    }
  }

  const existingPlacements = yield* findMany({
    db,
    model: db.models.placement,
    where: { wallId: { in: walls.map((entry) => entry.id) } },
    with: { brick: true },
  });
  if (existingPlacements.some((entry) => entry.brick.pageId !== pageId))
    throw new Error("The Page contains a Placement from another Page");

  const changedWalls: Array<{
    wallId: (typeof walls)[number]["id"];
    placementId: ReturnType<typeof makePlacementId>;
    layout: typeof activeWall.layout;
  }> = [];
  for (const currentWall of walls) {
    let destination: typeof wallInsertionTargetSchema.Type = target;
    if (currentWall.id !== activeWall.id) {
      const lastStack = currentWall.layout.sections.flatMap((entry) => entry.stacks).at(-1);
      const lastSection = currentWall.layout.sections.at(-1);
      destination = lastStack !== undefined
        ? { kind: "stack", wallId: currentWall.id, stackId: lastStack.id, beforeRowId: null }
        : lastSection !== undefined
          ? { kind: "section", wallId: currentWall.id, sectionId: lastSection.id }
          : { kind: "wall", wallId: currentWall.id, beforeSectionId: null };
    }
    const placementId = makePlacementId(brickId, currentWall.breakpoint);
    const newNodeIds = {
      sectionId: prefixId({ abbreviation: "sec" }, `${brickId}_${currentWall.id}`),
      stackId: prefixId({ abbreviation: "stk" }, `${brickId}_${currentWall.id}`),
      rowId: prefixId({ abbreviation: "row" }, `${brickId}_${currentWall.id}`),
    };
    let changed = currentWall.id === activeWall.id
      ? activeChange
      : insertPlacementInLayout({ layout: currentWall.layout, target: destination, placementId, newNodeIds });
    if (Result.isFailure(changed))
      return yield* wallInsertionFailure.make({ message: changed.failure, status: 409 });

    const placementMinimumWidths = new Map<string, number>(existingPlacements.filter((entry) => entry.wallId === currentWall.id).map((entry) => [entry.id, backendLibrary[entry.brick.moduleId].variants.default.minWidth]));
    placementMinimumWidths.set(placementId, module.variants.default.minWidth);
    let fit = measureWallFit({ layout: changed.success, placementMinimumWidths, wallWidth: wallBreakpointWidths[currentWall.breakpoint], brickGap: siteRow.brickGap });
    if (currentWall.id !== activeWall.id && fit.some((section) => !section.fits)) {
      changed = insertPlacementInLayout({
        layout: currentWall.layout,
        target: { kind: "wall", wallId: currentWall.id, beforeSectionId: null },
        placementId,
        newNodeIds,
      });
      if (Result.isFailure(changed))
        return yield* wallInsertionFailure.make({ message: changed.failure, status: 409 });
      fit = measureWallFit({ layout: changed.success, placementMinimumWidths, wallWidth: wallBreakpointWidths[currentWall.breakpoint], brickGap: siteRow.brickGap });
    }
    if (fit.some((section) => !section.fits))
      return yield* wallInsertionFailure.make({ message: "Not enough space in this Section", status: 409 });
    changedWalls.push({ wallId: currentWall.id, placementId, layout: changed.success });
  }

  for (const changed of changedWalls) {
    yield* operations.updateWall({ resourceId: changed.wallId, attributes: { layout: changed.layout } });
    yield* operations.createPlacement({
      resourceId: changed.placementId,
      attributes: {
        brickId,
        wallId: changed.wallId,
        layoutId,
        state: structuredClone(placementState),
        widthWeight: module.variants.default.defaultWidth,
      },
    });
  }
});
