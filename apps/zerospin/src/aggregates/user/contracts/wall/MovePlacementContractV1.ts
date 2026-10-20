import {
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
import { pageV3 as page } from "../../models/page/PageV3";
import { siteV3 as site } from "../../models/site/SiteV3";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { sectionV1 as section } from "../../models/section/SectionV1";
import { stackV1 as stack } from "../../models/stack/StackV1";
import { rowV1 as row } from "../../models/row/RowV1";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
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
export const movePlacement = makeAggregateContractVersion(
  defineAggregateContract("movePlacement"),
  {
    version: "1.0.0",
    models: { page, site, user, wall, section, stack, row, brick, placement },
    claims: userClaims,
    operations: {
      createSection: section.operations.create,
      updateSection: section.operations.update,
      createStack: stack.operations.create,
      updateStack: stack.operations.update,
      createRow: row.operations.create,
      updateRow: row.operations.update,
      deleteRow: row.operations.delete,
      updatePlacement: placement.operations.update,
    },
    payload: {
      id: primitives.text(),
      placementId: primitives.foreignKey({ abbreviation: "plc" }),
      target: primitives.json({ schema: targetSchema }),
    },
    failures: { invalidLayout: ContractError.schema({ code: "move-placement-invalid-layout" }) },
    program: Effect.fn("movePlacement.program")(function* (props) {
      const { db, payload, operations, failures, claims } = props;
      const { target } = payload;
      const actionId = payload.id;
      const moving = yield* findFirst({
        db,
        model: placement,
        where: { id: { eq: payload.placementId } },
      });
      const content =
        moving === undefined
          ? undefined
          : yield* findFirst({ db, model: brick, where: { id: { eq: moving.brickId } } });
      if (moving === undefined || content === undefined)
        return yield* failures.invalidLayout.make({
          message: "The Placement no longer exists",
          status: 404,
        });
      const pageId = content.pageId;
      const pageRow = yield* findFirst({ db, model: page, where: { id: { eq: pageId } } });
      const siteRow =
        pageRow === undefined || pageRow.siteId === null
          ? undefined
          : yield* findFirst({ db, model: site, where: { id: { eq: pageRow.siteId } } });
      const userRow =
        siteRow === undefined || siteRow.userId === null
          ? undefined
          : yield* findFirst({ db, model: user, where: { id: { eq: siteRow.userId } } });
      if (userRow === undefined || userRow.clerkUserId !== claims?.clerkUserId)
        return yield* failures.invalidLayout.make({
          message: "This Page is unavailable",
          status: 403,
        });
      const sourceRow = yield* findFirst({ db, model: row, where: { id: { eq: moving.rowId } } });
      const sourceStack =
        sourceRow === undefined
          ? undefined
          : yield* findFirst({ db, model: stack, where: { id: { eq: sourceRow.stackId } } });
      const sourceSection =
        sourceStack === undefined
          ? undefined
          : yield* findFirst({ db, model: section, where: { id: { eq: sourceStack.sectionId } } });
      const wallRow = yield* findFirst({ db, model: wall, where: { id: { eq: target.wallId } } });
      if (
        wallRow === undefined ||
        wallRow.pageId !== pageId ||
        sourceSection?.wallId !== wallRow.id
      )
        return yield* failures.invalidLayout.make({
          message: "Placements can only move within their Wall",
          status: 409,
        });
      const sections = (yield* findMany({
        db,
        model: section,
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
        destinationRow = yield* findFirst({ db, model: row, where: { id: { eq: target.rowId } } });
        destinationStack =
          destinationRow === undefined
            ? undefined
            : yield* findFirst({ db, model: stack, where: { id: { eq: destinationRow.stackId } } });
        beforePlacementId = target.beforePlacementId;
      } else if (target.kind === "stack") {
        destinationStack = yield* findFirst({
          db,
          model: stack,
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
          model: stack,
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
              model: row,
              where: { stackId: { eq: destinationStack.id } },
            })).sort((a, b) => a.position - b.position);
      if (beforeRowId !== null && !rows.some((entry) => entry.id === beforeRowId))
        return yield* failures.invalidLayout.make({
          message: "The Row insertion point no longer exists",
          status: 409,
        });
      const destinationRowIds = rows.map((entry) => entry.id);
      const placements =
        destinationRow === undefined
          ? []
          : (yield* findMany({
              db,
              model: placement,
              where: { rowId: { eq: destinationRow.id } },
            })).sort((a, b) => a.position - b.position);
      if (beforePlacementId !== null && !placements.some((entry) => entry.id === beforePlacementId))
        return yield* failures.invalidLayout.make({
          message: "The Placement insertion point no longer exists",
          status: 409,
        });
      if (beforePlacementId === moving.id) return;
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
          model: stack,
          where: { sectionId: { eq: destinationSection.id } },
        });
        yield* operations.createStack({
          resourceId: id,
          attributes: {
            sectionId: destinationSection.id,
            name: "Stack",
            position: siblings.length,
          },
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
        destinationRowIds.splice(position, 0, id);
      }
      const destinationSiblings = placements.filter((entry) => entry.id !== moving.id);
      const position =
        beforePlacementId === null
          ? destinationSiblings.length
          : destinationSiblings.findIndex((entry) => entry.id === beforePlacementId);
      const sourceSiblings = (yield* findMany({
        db,
        model: placement,
        where: { rowId: { eq: moving.rowId } },
      }))
        .filter((entry) => entry.id !== moving.id)
        .sort((a, b) => a.position - b.position);
      if (moving.rowId !== destinationRow.id) {
        for (let index = 0; index < sourceSiblings.length; index++)
          yield* operations.updatePlacement({
            resourceId: sourceSiblings[index].id,
            attributes: { position: index },
          });
      }
      for (let index = 0; index < destinationSiblings.length; index++)
        yield* operations.updatePlacement({
          resourceId: destinationSiblings[index].id,
          attributes: { position: index < position ? index : index + 1 },
        });
      yield* operations.updatePlacement({
        resourceId: moving.id,
        attributes: { rowId: destinationRow.id, position },
      });
      if (
        moving.rowId !== destinationRow.id &&
        sourceSiblings.length === 0 &&
        sourceRow !== undefined
      ) {
        yield* operations.deleteRow({ resourceId: sourceRow.id });
        // Reads precede recorded operations; include a newly inserted destination Row.
        const sourceRowIds =
          sourceRow.stackId === destinationStack.id
            ? destinationRowIds
            : (yield* findMany({
                db,
                model: row,
                where: { stackId: { eq: sourceRow.stackId } },
              }))
                .sort((a, b) => a.position - b.position)
                .map((entry) => entry.id);
        const remainingRowIds = sourceRowIds.filter((id) => id !== sourceRow.id);
        for (let index = 0; index < remainingRowIds.length; index++)
          yield* operations.updateRow({
            resourceId: remainingRowIds[index],
            attributes: { position: index },
          });
      }
    }),
  },
);
