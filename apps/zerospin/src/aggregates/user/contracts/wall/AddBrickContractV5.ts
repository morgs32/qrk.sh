import {
  upgradeAggregateContractRelease,
  findFirst,
  findMany,
  prefixId,
} from "@zerospin/sdk/browser";
import { Effect, Result, Schema } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { addBrickV4 } from "./AddBrickContractV4";
import { backendLibrary } from "@qrk.sh/bricks/definition/backendLibrary";
import { makePlacementId } from "../../layout/makePlacementId";
import { canShareRow } from "../../layout/canShareRow";
import { insertPlacementInLayout } from "../../layout/wallLayoutV3";
import { wallInsertionTargetSchema } from "../../layout/wallTargetSchemas";
import { measureWallFit, wallBreakpointWidths } from "../../layout/wallSizing";
import { makeEffectSchema } from "@zerospin/shapes";

export const addBrickV5 = upgradeAggregateContractRelease(addBrickV4, {
  version: 5,
  payload: {},
  models: { wall, placement },
  operations: { updateWall: wall.operations.update, createPlacement: placement.operations.create },
  program: Effect.fn("addBrick.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { pageId, target } = payload;
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

    const walls = yield* findMany({ db, model: db.models.wall, where: { pageId: { eq: pageId } } });
    const activeWall = walls.find((entry) => entry.id === target.wallId);
    if (activeWall === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Wall does not belong to this Page",
        status: 409,
      });
    const module = backendLibrary[payload.moduleId];
    const StateSchema = Schema.toType(makeEffectSchema(module.stateShape));
    const decodedState = Schema.decodeUnknownResult(
      module.hasPlaceholder ? Schema.NullOr(StateSchema) : StateSchema,
    )(payload.state, { onExcessProperty: "ignore" });
    if (Result.isFailure(decodedState))
      return yield* failures.invalidState.make({
        message: `Brick state is invalid for module ${module.id}`,
        status: 400,
      });
    const existingBricks = yield* findMany({
      db,
      model: db.models.brick,
      where: { pageId: { eq: pageId } },
    });
    if (existingBricks.some((entry) => entry.id === payload.id))
      return yield* failures.invalidLayout.make({
        message: "This Brick already exists",
        status: 409,
      });
    if (
      module.maxPerPage !== undefined &&
      existingBricks.filter((entry) => entry.moduleId === payload.moduleId).length >=
        module.maxPerPage
    )
      return yield* failures.invalidLayout.make({
        message: "This module has reached its Page limit",
        status: 409,
      });
    if (walls.length !== 4)
      return yield* failures.invalidLayout.make({
        message: "A Page requires all four breakpoint Walls",
        status: 409,
      });

    const activeChange = insertPlacementInLayout({
      layout: activeWall.layout,
      target,
      placementId: makePlacementId(payload.id, activeWall.breakpoint),
      newNodeIds: {
        sectionId: prefixId({ abbreviation: "sec" }, `${payload.id}_${activeWall.id}`),
        stackId: prefixId({ abbreviation: "stk" }, `${payload.id}_${activeWall.id}`),
        rowId: prefixId({ abbreviation: "row" }, `${payload.id}_${activeWall.id}`),
      },
    });
    if (Result.isFailure(activeChange))
      return yield* failures.invalidLayout.make({ message: activeChange.failure, status: 409 });

    if (target.kind === "row") {
      const destination = activeWall.layout.sections
        .flatMap((entry) => entry.stacks)
        .flatMap((entry) => entry.rows)
        .find((entry) => entry.id === target.rowId);
      if (destination !== undefined) {
        const existingPlacements = yield* findMany({
          db,
          model: db.models.placement,
          where: { wallId: { eq: activeWall.id }, id: { in: destination.placementIds } },
          with: { brick: true },
        });
        if (
          existingPlacements.length !== destination.placementIds.length ||
          existingPlacements.some((entry) => entry.brick.pageId !== pageId)
        )
          throw new Error("The Row contains a Placement missing from its Wall");
        if (
          !canShareRow({
            incomingVariant: module.variants.default,
            existingVariants: existingPlacements.map(
              (entry) => backendLibrary[entry.brick.moduleId].variants[entry.variantId],
            ),
          })
        )
          return yield* failures.invalidLayout.make({
            message: "Variable-height Bricks require their own Row",
            status: 409,
          });
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
        destination =
          lastStack !== undefined
            ? { kind: "stack", wallId: currentWall.id, stackId: lastStack.id, beforeRowId: null }
            : lastSection !== undefined
              ? { kind: "section", wallId: currentWall.id, sectionId: lastSection.id }
              : { kind: "wall", wallId: currentWall.id, beforeSectionId: null };
      }
      const placementId = makePlacementId(payload.id, currentWall.breakpoint);
      const newNodeIds = {
        sectionId: prefixId({ abbreviation: "sec" }, `${payload.id}_${currentWall.id}`),
        stackId: prefixId({ abbreviation: "stk" }, `${payload.id}_${currentWall.id}`),
        rowId: prefixId({ abbreviation: "row" }, `${payload.id}_${currentWall.id}`),
      };
      let changed =
        currentWall.id === activeWall.id
          ? activeChange
          : insertPlacementInLayout({
              layout: currentWall.layout,
              target: destination,
              placementId,
              newNodeIds,
            });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      const placementMinimumWidths = new Map(
        existingPlacements
          .filter((entry) => entry.wallId === currentWall.id)
          .map((entry) => [
            entry.id,
            backendLibrary[entry.brick.moduleId].variants[entry.variantId].minWidth,
          ]),
      );
      placementMinimumWidths.set(placementId, module.variants.default.minWidth);
      let fit = measureWallFit({
        layout: changed.success,
        placementMinimumWidths,
        wallWidth: wallBreakpointWidths[currentWall.breakpoint],
        brickGap: siteRow.brickGap,
      });
      if (currentWall.id !== activeWall.id && fit.some((section) => !section.fits)) {
        changed = insertPlacementInLayout({
          layout: currentWall.layout,
          target: { kind: "wall", wallId: currentWall.id, beforeSectionId: null },
          placementId,
          newNodeIds,
        });
        if (Result.isFailure(changed))
          return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
        fit = measureWallFit({
          layout: changed.success,
          placementMinimumWidths,
          wallWidth: wallBreakpointWidths[currentWall.breakpoint],
          brickGap: siteRow.brickGap,
        });
      }
      if (fit.some((section) => !section.fits))
        return yield* failures.invalidLayout.make({
          message: "Not enough space in this Section",
          status: 409,
        });
      changedWalls.push({ wallId: currentWall.id, placementId, layout: changed.success });
    }
    yield* operations.createBrick({
      resourceId: payload.id,
      attributes: {
        pageId,
        moduleId: payload.moduleId,
        state: structuredClone(decodedState.success),
        stateRevision: 0,
        borderWidth: 0,
      },
    });
    for (const changed of changedWalls) {
      yield* operations.updateWall({
        resourceId: changed.wallId,
        attributes: { layout: changed.layout },
      });
      yield* operations.createPlacement({
        resourceId: changed.placementId,
        attributes: {
          brickId: payload.id,
          wallId: changed.wallId,
          variantId: "default",
          widthWeight: module.variants.default.defaultWidth,
          spec: structuredClone(module.defaultSpec),
          specRevision: 0,
          generation: null,
        },
      });
    }
  }),
});
