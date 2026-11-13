import { Result } from "effect";
import type {
  wallLayoutSchema,
  sectionIdSchema,
  stackIdSchema,
  rowIdSchema,
} from "../models/wall/wallLayoutSchema";
import type { wallInsertionTargetSchema } from "./wallInsertionTargetSchema";
import type { placementV1 } from "../models/placement/PlacementV1";
import type { IInferResource } from "@zerospin/core/models/types";

/** Return an updated Wall layout without mutating the caller’s layout. */
export function insertPlacementInLayout(props: {
  layout: typeof wallLayoutSchema.Type;
  target: typeof wallInsertionTargetSchema.Type;
  placementId: IInferResource<typeof placementV1>["id"];
  newNodeIds: {
    sectionId: typeof sectionIdSchema.Type;
    stackId: typeof stackIdSchema.Type;
    rowId: typeof rowIdSchema.Type;
  };
}) {
  const { layout: currentLayout, target, placementId, newNodeIds } = props;
  const layout = structuredClone(currentLayout);
  let destinationSection = layout.sections.find((section) =>
    target.kind === "section"
      ? section.id === target.sectionId
      : target.kind === "stack"
        ? section.stacks.some((stack) => stack.id === target.stackId)
        : target.kind === "row"
          ? section.stacks.some((stack) => stack.rows.some((row) => row.id === target.rowId))
          : false,
  );
  let destinationStack = destinationSection?.stacks.find((stack) =>
    target.kind === "stack"
      ? stack.id === target.stackId
      : target.kind === "row"
        ? stack.rows.some((row) => row.id === target.rowId)
        : false,
  );
  let destinationRow = destinationStack?.rows.find(
    (row) => target.kind === "row" && row.id === target.rowId,
  );
  if (target.kind !== "wall" && destinationSection === undefined)
    return Result.fail("The insertion target no longer belongs to this Wall");
  if (
    (target.kind === "stack" && destinationStack === undefined) ||
    (target.kind === "row" && destinationRow === undefined)
  )
    return Result.fail("The insertion target no longer exists");
  if (
    target.kind === "wall" &&
    target.beforeSectionId !== null &&
    !layout.sections.some((section) => section.id === target.beforeSectionId)
  )
    return Result.fail("The Section insertion point no longer exists");
  if (
    target.kind === "stack" &&
    target.beforeRowId !== null &&
    !destinationStack?.rows.some((row) => row.id === target.beforeRowId)
  )
    return Result.fail("The Row insertion point no longer exists");
  if (
    target.kind === "row" &&
    target.beforePlacementId !== null &&
    !destinationRow?.placementIds.some((id) => id === target.beforePlacementId)
  )
    return Result.fail("The Placement insertion point no longer exists");

  if (destinationSection === undefined) {
    destinationSection = { id: newNodeIds.sectionId, stacks: [] };
    const position =
      target.kind === "wall" && target.beforeSectionId !== null
        ? layout.sections.findIndex((section) => section.id === target.beforeSectionId)
        : layout.sections.length;
    layout.sections.splice(position, 0, destinationSection);
  }
  if (destinationStack === undefined) {
    const count = destinationSection.stacks.length;
    const maximum = destinationSection.stacks.reduce(
      (max, stack) => Math.max(max, stack.widthWeight ?? 1),
      0,
    );
    const widthWeight =
      count === 0 || destinationSection.stacks.every((stack) => stack.widthWeight === undefined)
        ? 1
        : maximum *
          Math.min(
            1,
            destinationSection.stacks.reduce(
              (sum, stack) => sum + (stack.widthWeight ?? 1) / maximum / count,
              0,
            ),
          );
    destinationStack = {
      id: newNodeIds.stackId,
      name: "Stack",
      ...(widthWeight === 1 ? {} : { widthWeight }),
      rows: [],
    };
    destinationSection.stacks.push(destinationStack);
  }
  if (destinationRow === undefined) {
    destinationRow = { id: newNodeIds.rowId, minHeight: null, placementIds: [] };
    const position =
      target.kind === "stack" && target.beforeRowId !== null
        ? destinationStack.rows.findIndex((row) => row.id === target.beforeRowId)
        : destinationStack.rows.length;
    destinationStack.rows.splice(position, 0, destinationRow);
  }
  const position =
    target.kind === "row" && target.beforePlacementId !== null
      ? destinationRow.placementIds.findIndex((id) => id === target.beforePlacementId)
      : destinationRow.placementIds.length;
  destinationRow.placementIds.splice(position, 0, placementId);
  return Result.succeed(layout);
}
