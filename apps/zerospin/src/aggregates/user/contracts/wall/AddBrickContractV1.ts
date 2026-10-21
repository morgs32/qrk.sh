import { brick as brickIdentity } from "../../models/brick/brick";

import { page as pageIdentity } from "../../models/page/page";

import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractVersion,
  findFirst,
  findMany,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";

import { Effect, Schema } from "effect";

import { userClaims } from "../../../../claims";

import { pageV1 as page } from "../../models/page/PageV1";

import { siteV1 as site } from "../../models/site/SiteV1";

import { userV1 as user } from "../../models/user/UserV1";

import { wallV1 as wall } from "../../models/wall/WallV1";

import { sectionV1 as section } from "../../models/section/SectionV1";

import { stackV1 as stack } from "../../models/stack/StackV1";

import { rowV1 as row } from "../../models/row/RowV1";

import { brickV1 as brick } from "../../models/brick/BrickV1";

import { placementV1 as placement } from "../../models/placement/PlacementV1";

import { backendLibrary } from "../../../../modules/backendLibrary";

import { makePlacementId } from "../../../../modules/lib/makePlacementId";

const targetSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("row"),
    wallId: Schema.String,
    rowId: Schema.String,
    beforePlacementId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("stack"),
    wallId: Schema.String,
    stackId: Schema.String,
    beforeRowId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("section"),
    wallId: Schema.String,
    sectionId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("wall"),
    wallId: Schema.String,
    beforeSectionId: Schema.NullOr(Schema.String),
  }),
]);

export const addBrickV1 = makeAggregateContractVersion(defineAggregateContract("addBrick"), {
  version: 1,
  models: {
    page,
    site,
    user,
    wall,
    section,
    stack,
    row,
    brick,
    placement,
  },
  claims: userClaims,
  operations: {
    createSection: section.operations.create,
    updateSection: section.operations.update,
    createStack: stack.operations.create,
    updateStack: stack.operations.update,
    createRow: row.operations.create,
    updateRow: row.operations.update,
    updatePlacement: placement.operations.update,
    createBrick: brick.operations.create,
    createPlacement: placement.operations.create,
  },
  payload: {
    id: modelId({ model: brickIdentity }),
    pageId: modelId({ model: pageIdentity }),
    moduleId: brick.attributes.moduleId,
    target: primitives.json({ schema: targetSchema }),
  },
  failures: { invalidLayout: ContractError.schema({ code: "add-brick-invalid-layout" }) },
  program: Effect.fn("addBrick.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { pageId, target } = payload;
    const actionId = payload.id;
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
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: target.wallId } },
    });
    if (wallRow === undefined || wallRow.pageId !== pageId)
      return yield* failures.invalidLayout.make({
        message: "The Wall does not belong to this Page",
        status: 409,
      });
    const module = backendLibrary[payload.moduleId];
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
    const sections = (yield* findMany({
      db,
      model: db.models.section,
      where: { wallId: { eq: wallRow.id } },
    })).sort((a, b) => a.position - b.position);
    let destinationStack:
      | { id: `stk_${string}`; sectionId: `sec_${string}`; name: string; position: number }
      | undefined;
    let destinationRow:
      | { id: `row_${string}`; stackId: `stk_${string}`; position: number }
      | undefined;
    let beforePlacementId: string | null = null;
    let beforeRowId: string | null = null;
    if (target.kind === "row") {
      destinationRow = yield* findFirst({
        db,
        model: db.models.row,
        where: { id: { eq: target.rowId } },
      });
      destinationStack =
        destinationRow === undefined
          ? undefined
          : yield* findFirst({
              db,
              model: db.models.stack,
              where: { id: { eq: destinationRow.stackId } },
            });
      beforePlacementId = target.beforePlacementId;
    } else if (target.kind === "stack") {
      destinationStack = yield* findFirst({
        db,
        model: db.models.stack,
        where: { id: { eq: target.stackId } },
      });
      beforeRowId = target.beforeRowId;
    }
    let destinationSection:
      | { id: `sec_${string}`; wallId: `wal_${string}`; position: number }
      | undefined =
      target.kind === "section"
        ? sections.find((entry) => entry.id === target.sectionId)
        : destinationStack === undefined
          ? undefined
          : sections.find((entry) => entry.id === destinationStack.sectionId);
    if (target.kind !== "wall" && destinationSection === undefined)
      return yield* failures.invalidLayout.make({
        message: "The insertion target no longer belongs to this Wall",
        status: 409,
      });
    if (
      (target.kind === "row" && destinationRow === undefined) ||
      (target.kind === "stack" && destinationStack === undefined)
    )
      return yield* failures.invalidLayout.make({
        message: "The insertion target no longer exists",
        status: 409,
      });
    if (
      target.kind === "wall" &&
      target.beforeSectionId !== null &&
      !sections.some((entry) => entry.id === target.beforeSectionId)
    )
      return yield* failures.invalidLayout.make({
        message: "The Section insertion point no longer exists",
        status: 409,
      });
    if (destinationSection !== undefined && destinationStack === undefined) {
      const siblings = yield* findMany({
        db,
        model: db.models.stack,
        where: { sectionId: { eq: destinationSection.id } },
      });
      const capacity = { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint];
      if (siblings.length >= capacity)
        return yield* failures.invalidLayout.make({
          message: "This Section has reached its Stack limit",
          status: 409,
        });
    }
    const rows =
      destinationStack === undefined
        ? []
        : (yield* findMany({
            db,
            model: db.models.row,
            where: { stackId: { eq: destinationStack.id } },
          })).sort((a, b) => a.position - b.position);
    if (beforeRowId !== null && !rows.some((entry) => entry.id === beforeRowId))
      return yield* failures.invalidLayout.make({
        message: "The Row insertion point no longer exists",
        status: 409,
      });
    const placements =
      destinationRow === undefined
        ? []
        : (yield* findMany({
            db,
            model: db.models.placement,
            where: { rowId: { eq: destinationRow.id } },
          })).sort((a, b) => a.position - b.position);
    if (beforePlacementId !== null && !placements.some((entry) => entry.id === beforePlacementId))
      return yield* failures.invalidLayout.make({
        message: "The Placement insertion point no longer exists",
        status: 409,
      });
    if (destinationSection === undefined) {
      const id = prefixId(section, `${actionId}_${wallRow.id}`);
      const position =
        target.kind === "wall" && target.beforeSectionId !== null
          ? sections.findIndex((entry) => entry.id === target.beforeSectionId)
          : sections.length;
      for (let index = position; index < sections.length; index++)
        yield* operations.updateSection({
          resourceId: sections[index].id,
          attributes: { position: index + 1 },
        });
      yield* operations.createSection({
        resourceId: id,
        attributes: { wallId: wallRow.id, position },
      });
      destinationSection = { id, wallId: wallRow.id, position };
    }
    if (destinationStack === undefined) {
      const id = prefixId(stack, `${actionId}_${wallRow.id}`);
      const siblings = yield* findMany({
        db,
        model: db.models.stack,
        where: { sectionId: { eq: destinationSection.id } },
      });
      yield* operations.createStack({
        resourceId: id,
        attributes: { sectionId: destinationSection.id, name: "Stack", position: siblings.length },
      });
      destinationStack = {
        id,
        sectionId: destinationSection.id,
        name: "Stack",
        position: siblings.length,
      };
    }
    if (destinationRow === undefined) {
      const id = prefixId(row, `${actionId}_${wallRow.id}`);
      const position =
        beforeRowId === null ? rows.length : rows.findIndex((entry) => entry.id === beforeRowId);
      for (let index = position; index < rows.length; index++)
        yield* operations.updateRow({
          resourceId: rows[index].id,
          attributes: { position: index + 1 },
        });
      yield* operations.createRow({
        resourceId: id,
        attributes: { stackId: destinationStack.id, position },
      });
      destinationRow = { id, stackId: destinationStack.id, position };
    }
    const position =
      beforePlacementId === null
        ? placements.length
        : placements.findIndex((entry) => entry.id === beforePlacementId);
    for (let index = position; index < placements.length; index++)
      yield* operations.updatePlacement({
        resourceId: placements[index].id,
        attributes: { position: index + 1 },
      });
    yield* operations.createBrick({
      resourceId: payload.id,
      attributes: { pageId, moduleId: payload.moduleId, state: null, stateRevision: 0 },
    });
    yield* operations.createPlacement({
      resourceId: makePlacementId(payload.id, wallRow.breakpoint),
      attributes: {
        brickId: payload.id,
        rowId: destinationRow.id,
        position,
        variantId: "default",
        spec: structuredClone(module.defaultSpec),
        specRevision: 0,
        generation: null,
      },
    });
    const otherWalls = yield* findMany({
      db,
      model: db.models.wall,
      where: { pageId: { eq: pageId } },
    });
    if (otherWalls.length !== 4)
      return yield* failures.invalidLayout.make({
        message: "A Page requires all four breakpoint Walls",
        status: 409,
      });
    for (const otherWall of otherWalls) {
      if (otherWall.id === wallRow.id) continue;
      const otherSections = (yield* findMany({
        db,
        model: db.models.section,
        where: { wallId: { eq: otherWall.id } },
      })).sort((a, b) => a.position - b.position);
      let lastSection:
        | { id: `sec_${string}`; wallId: `wal_${string}`; position: number }
        | undefined = otherSections.at(-1);
      let lastStack:
        | { id: `stk_${string}`; sectionId: `sec_${string}`; name: string; position: number }
        | undefined;
      for (const candidate of otherSections) {
        const stacks = (yield* findMany({
          db,
          model: db.models.stack,
          where: { sectionId: { eq: candidate.id } },
        })).sort((a, b) => a.position - b.position);
        if (stacks.length > 0) {
          lastSection = candidate;
          lastStack = stacks.at(-1);
        }
      }
      if (lastSection === undefined) {
        const id = prefixId(section, `${actionId}_${otherWall.id}`);
        yield* operations.createSection({
          resourceId: id,
          attributes: { wallId: otherWall.id, position: 0 },
        });
        lastSection = { id, wallId: otherWall.id, position: 0 };
      }
      if (lastStack === undefined) {
        const id = prefixId(stack, `${actionId}_${otherWall.id}`);
        yield* operations.createStack({
          resourceId: id,
          attributes: { sectionId: lastSection.id, name: "Stack", position: 0 },
        });
        lastStack = { id, sectionId: lastSection.id, name: "Stack", position: 0 };
      }
      const otherRows = yield* findMany({
        db,
        model: db.models.row,
        where: { stackId: { eq: lastStack.id } },
      });
      const rowId = prefixId(row, `${actionId}_${otherWall.id}`);
      yield* operations.createRow({
        resourceId: rowId,
        attributes: { stackId: lastStack.id, position: otherRows.length },
      });
      yield* operations.createPlacement({
        resourceId: makePlacementId(payload.id, otherWall.breakpoint),
        attributes: {
          brickId: payload.id,
          rowId,
          position: 0,
          variantId: "default",
          spec: structuredClone(module.defaultSpec),
          specRevision: 0,
          generation: null,
        },
      });
    }
  }),
});
