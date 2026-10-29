import {
  ContractError,
  defineAggregateContract,
  findFirst,
  findMany,
  makeAggregateContractRelease,
  modelId,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";
import { makeEffectSchema } from "@zerospin/shapes";
import { Effect, Result, Schema } from "effect";
import { userClaims } from "../../../../claims";
import { brick as brickIdentity } from "../../models/brick/brick";
import { page as pageIdentity } from "../../models/page/page";
import { brickV2 as brick } from "../../models/brick/BrickV2";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { backendLibrary } from "../../../../modules/backendLibrary";
import { makePlacementId } from "../../../../modules/lib/makePlacementId";
import { canShareRow } from "../../../../modules/lib/canShareRow";
import { insertPlacementInLayout } from "../../layout/wallLayout";
import { wallInsertionTargetSchema } from "../../layout/wallTargetSchemas";

export const addBrickV3 = makeAggregateContractRelease(defineAggregateContract("addBrick"), {
  version: 3,
  models: { page, site, user, wall, brick, placement },
  claims: userClaims,
  operations: {
    updateWall: wall.operations.update,
    createBrick: brick.operations.create,
    createPlacement: placement.operations.create,
  },
  payload: {
    id: modelId({ model: brickIdentity }),
    pageId: modelId({ model: pageIdentity }),
    moduleId: brick.attributes.moduleId,
    target: primitives.json({ schema: wallInsertionTargetSchema }),
    state: primitives.json({ schema: Schema.Unknown }),
  },
  failures: {
    invalidLayout: ContractError.schema({ code: "add-brick-invalid-layout" }),
    invalidState: ContractError.schema({ code: "add-brick-invalid-state" }),
  },
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
    if (userRow === undefined || userRow.clerkUserId !== claims?.clerkUserId)
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
      stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[activeWall.breakpoint],
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
      const changed =
        currentWall.id === activeWall.id
          ? activeChange
          : insertPlacementInLayout({
              layout: currentWall.layout,
              target: destination,
              placementId,
              newNodeIds: {
                sectionId: prefixId({ abbreviation: "sec" }, `${payload.id}_${currentWall.id}`),
                stackId: prefixId({ abbreviation: "stk" }, `${payload.id}_${currentWall.id}`),
                rowId: prefixId({ abbreviation: "row" }, `${payload.id}_${currentWall.id}`),
              },
              stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[currentWall.breakpoint],
            });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      yield* operations.updateWall({
        resourceId: currentWall.id,
        attributes: { layout: changed.success },
      });
      yield* operations.createPlacement({
        resourceId: placementId,
        attributes: {
          brickId: payload.id,
          wallId: currentWall.id,
          variantId: "default",
          spec: structuredClone(module.defaultSpec),
          specRevision: 0,
          generation: null,
        },
      });
    }
  }),
});
