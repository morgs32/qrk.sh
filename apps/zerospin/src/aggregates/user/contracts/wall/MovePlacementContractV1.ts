import { placement as placementIdentity } from "../../models/placement/placement";

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

import { cleanupWall } from "./utils/cleanupWall";

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

export const movePlacementV1 = makeAggregateContractVersion(
  defineAggregateContract("movePlacement"),
  {
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
      deleteSection: section.operations.delete,
      createStack: stack.operations.create,
      updateStack: stack.operations.update,
      deleteStack: stack.operations.delete,
      createRow: row.operations.create,
      updateRow: row.operations.update,
      deleteRow: row.operations.delete,
      updatePlacement: placement.operations.update,
    },
    payload: {
      id: primitives.text(),
      placementId: modelId({ model: placementIdentity }),
      target: primitives.json({ schema: targetSchema }),
    },
    failures: { invalidLayout: ContractError.schema({ code: "move-placement-invalid-layout" }) },
    program: Effect.fn("movePlacement.program")(function* (props) {
      const { db, payload, operations, failures, claims } = props;
      const { target } = payload;
      const actionId = payload.id;
      const moving = yield* findFirst({
        db,
        model: db.models.placement,
        where: { id: { eq: payload.placementId } },
      });
      const content =
        moving === undefined
          ? undefined
          : yield* findFirst({ db, model: db.models.brick, where: { id: { eq: moving.brickId } } });
      if (moving === undefined || content === undefined)
        return yield* failures.invalidLayout.make({
          message: "The Placement no longer exists",
          status: 404,
        });
      const pageId = content.pageId;
      const pageRow = yield* findFirst({
        db,
        model: db.models.page,
        where: { id: { eq: pageId } },
      });
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
          message: "Placements can only move within their Wall",
          status: 409,
        });
      const sections = yield* findMany({
        db,
        model: db.models.section,
        where: { wallId: { eq: wallRow.id } },
        columns: { id: true, position: true },
        orderBy: { position: "asc" },
        with: {
          stacks: {
            columns: { id: true, position: true },
            orderBy: { position: "asc" },
            with: {
              rows: {
                columns: { id: true, position: true },
                orderBy: { position: "asc" },
                with: {
                  placements: {
                    columns: { id: true, position: true },
                    orderBy: { position: "asc" },
                  },
                },
              },
            },
          },
        },
      });
      const sourceSection = sections.find((entry) =>
        entry.stacks.some((stack) =>
          stack.rows.some((row) => row.placements.some((entry) => entry.id === moving.id)),
        ),
      );
      const sourceStack = sourceSection?.stacks.find((entry) =>
        entry.rows.some((row) => row.placements.some((entry) => entry.id === moving.id)),
      );
      const sourceRow = sourceStack?.rows.find((entry) =>
        entry.placements.some((entry) => entry.id === moving.id),
      );
      const movingPlacement = sourceRow?.placements.find((entry) => entry.id === moving.id);
      if (sourceRow === undefined || movingPlacement === undefined)
        return yield* failures.invalidLayout.make({
          message: "Placements can only move within their Wall",
          status: 409,
        });
      let destinationSection: (typeof sections)[number] | undefined;
      let destinationStack: (typeof sections)[number]["stacks"][number] | undefined;
      let destinationRow: (typeof sections)[number]["stacks"][number]["rows"][number] | undefined;
      let beforePlacementId: string | null = null;
      let beforeRowId: string | null = null;
      if (target.kind === "row") {
        destinationSection = sections.find((entry) =>
          entry.stacks.some((stack) => stack.rows.some((entry) => entry.id === target.rowId)),
        );
        destinationStack = destinationSection?.stacks.find((entry) =>
          entry.rows.some((entry) => entry.id === target.rowId),
        );
        destinationRow = destinationStack?.rows.find((entry) => entry.id === target.rowId);
        beforePlacementId = target.beforePlacementId;
      } else if (target.kind === "stack") {
        destinationSection = sections.find((entry) =>
          entry.stacks.some((entry) => entry.id === target.stackId),
        );
        destinationStack = destinationSection?.stacks.find((entry) => entry.id === target.stackId);
        beforeRowId = target.beforeRowId;
      } else if (target.kind === "section") {
        destinationSection = sections.find((entry) => entry.id === target.sectionId);
      }
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
      if (beforeRowId !== null && !destinationStack?.rows.some((entry) => entry.id === beforeRowId))
        return yield* failures.invalidLayout.make({
          message: "The Row insertion point no longer exists",
          status: 409,
        });
      if (
        beforePlacementId !== null &&
        !destinationRow?.placements.some((entry) => entry.id === beforePlacementId)
      )
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
        yield* operations.createSection({
          resourceId: id,
          attributes: { wallId: wallRow.id, position },
        });
        destinationSection = { id, position, stacks: [] };
        sections.splice(position, 0, destinationSection);
      }
      if (destinationStack === undefined) {
        const id = prefixId(stack, `${actionId}_${wallRow.id}`);
        const position = destinationSection.stacks.length;
        yield* operations.createStack({
          resourceId: id,
          attributes: { sectionId: destinationSection.id, name: "Stack", position },
        });
        destinationStack = { id, position, rows: [] };
        destinationSection.stacks.push(destinationStack);
      }
      if (destinationRow === undefined) {
        const id = prefixId(row, `${actionId}_${wallRow.id}`);
        const position =
          beforeRowId === null
            ? destinationStack.rows.length
            : destinationStack.rows.findIndex((entry) => entry.id === beforeRowId);
        yield* operations.createRow({
          resourceId: id,
          attributes: { stackId: destinationStack.id, position },
        });
        destinationRow = { id, position, placements: [] };
        destinationStack.rows.splice(position, 0, destinationRow);
      }
      sourceRow.placements = sourceRow.placements.filter((entry) => entry.id !== moving.id);
      const position =
        beforePlacementId === null
          ? destinationRow.placements.length
          : destinationRow.placements.findIndex((entry) => entry.id === beforePlacementId);
      destinationRow.placements.splice(position, 0, movingPlacement);
      yield* operations.updatePlacement({
        resourceId: moving.id,
        attributes: { rowId: destinationRow.id },
      });
      yield* cleanupWall({ sections, operations });
      const capacity = { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint];
      if (sections.some((entry) => entry.stacks.length > capacity))
        return yield* failures.invalidLayout.make({
          message: "This Section has reached its Stack limit",
          status: 409,
        });
    }),
  },
);
