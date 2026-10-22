import { Result } from "effect";
import type {
  wallLayoutSchema,
  sectionIdSchema,
  stackIdSchema,
  rowIdSchema,
} from "./wallLayoutSchema";
import type { wallInsertionTargetSchema, stackMoveTargetSchema } from "./wallTargetSchemas";
import type { placementV1 } from "../models/placement/PlacementV1";
import type { IInferResource } from "@zerospin/core/models/types";

/** Edit a private candidate; callers decide whether additions or movement own capacity checks. */
function insertIntoLayout(props: {
  layout: typeof wallLayoutSchema.Type;
  target: typeof wallInsertionTargetSchema.Type;
  placementId: IInferResource<typeof placementV1>["id"];
  newNodeIds: {
    sectionId: typeof sectionIdSchema.Type;
    stackId: typeof stackIdSchema.Type;
    rowId: typeof rowIdSchema.Type;
  };
}) {
  const { layout, target, placementId, newNodeIds } = props;
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
    destinationStack = { id: newNodeIds.stackId, name: "Stack", rows: [] };
    destinationSection.stacks.push(destinationStack);
  }
  if (destinationRow === undefined) {
    destinationRow = { id: newNodeIds.rowId, placementIds: [] };
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

/** Movement retains its existing whole-Wall pruning policy, after destination insertion. */
function pruneEmptyContainers(layout: typeof wallLayoutSchema.Type) {
  for (let sectionIndex = layout.sections.length - 1; sectionIndex >= 0; sectionIndex--) {
    const section = layout.sections[sectionIndex];
    for (let stackIndex = section.stacks.length - 1; stackIndex >= 0; stackIndex--) {
      const stack = section.stacks[stackIndex];
      for (let rowIndex = stack.rows.length - 1; rowIndex >= 0; rowIndex--)
        if (stack.rows[rowIndex].placementIds.length === 0) stack.rows.splice(rowIndex, 1);
      if (stack.rows.length === 0) section.stacks.splice(stackIndex, 1);
    }
    if (section.stacks.length === 0) layout.sections.splice(sectionIndex, 1);
  }
}

export function insertPlacementInLayout(props: {
  layout: typeof wallLayoutSchema.Type;
  target: typeof wallInsertionTargetSchema.Type;
  placementId: IInferResource<typeof placementV1>["id"];
  newNodeIds: {
    sectionId: typeof sectionIdSchema.Type;
    stackId: typeof stackIdSchema.Type;
    rowId: typeof rowIdSchema.Type;
  };
  stackLimit: number;
}) {
  const { layout, target, placementId, newNodeIds, stackLimit } = props;
  const inserted = insertIntoLayout({
    layout: structuredClone(layout),
    target,
    placementId,
    newNodeIds,
  });
  if (Result.isFailure(inserted)) return inserted;
  if (
    target.kind === "section" &&
    inserted.success.sections.some(
      (section) => section.id === target.sectionId && section.stacks.length > stackLimit,
    )
  )
    return Result.fail("This Section has reached its Stack limit");
  return inserted;
}

export function movePlacementInLayout(props: {
  layout: typeof wallLayoutSchema.Type;
  target: typeof wallInsertionTargetSchema.Type;
  placementId: IInferResource<typeof placementV1>["id"];
  newNodeIds: {
    sectionId: typeof sectionIdSchema.Type;
    stackId: typeof stackIdSchema.Type;
    rowId: typeof rowIdSchema.Type;
  };
  stackLimit: number;
}) {
  const { layout, target, placementId, newNodeIds, stackLimit } = props;
  const candidate = structuredClone(layout);
  const sourceRow = candidate.sections
    .flatMap((section) => section.stacks)
    .flatMap((stack) => stack.rows)
    .find((row) => row.placementIds.includes(placementId));
  if (sourceRow === undefined) return Result.fail("Placements can only move within their Wall");
  if (
    target.kind === "row" &&
    target.rowId === sourceRow.id &&
    target.beforePlacementId === placementId
  )
    return Result.succeed(layout);
  sourceRow.placementIds.splice(sourceRow.placementIds.indexOf(placementId), 1);
  const inserted = insertIntoLayout({ layout: candidate, target, placementId, newNodeIds });
  if (Result.isFailure(inserted)) return inserted;
  pruneEmptyContainers(candidate);
  if (candidate.sections.some((section) => section.stacks.length > stackLimit))
    return Result.fail("This Section has reached its Stack limit");
  return Result.succeed(candidate);
}

export function moveStackInLayout(props: {
  layout: typeof wallLayoutSchema.Type;
  target: typeof stackMoveTargetSchema.Type;
  stackId: typeof stackIdSchema.Type;
  newSectionId: typeof sectionIdSchema.Type;
  stackLimit: number;
}) {
  const { layout, target, stackId, newSectionId, stackLimit } = props;
  const candidate = structuredClone(layout);
  const sourceSection = candidate.sections.find((section) =>
    section.stacks.some((stack) => stack.id === stackId),
  );
  const movingStack = sourceSection?.stacks.find((stack) => stack.id === stackId);
  if (sourceSection === undefined || movingStack === undefined)
    return Result.fail("The Stack no longer belongs to this Wall");
  let destinationSection =
    target.kind === "section"
      ? candidate.sections.find((section) => section.id === target.sectionId)
      : undefined;
  if (target.kind === "section" && destinationSection === undefined)
    return Result.fail("The destination Section no longer exists");
  if (
    target.kind === "wall" &&
    target.beforeSectionId !== null &&
    !candidate.sections.some((section) => section.id === target.beforeSectionId)
  )
    return Result.fail("The Section insertion point no longer exists");
  const beforeStackId = target.kind === "section" ? target.beforeStackId : null;
  if (destinationSection === sourceSection && beforeStackId === stackId)
    return Result.succeed(layout);
  const siblings = destinationSection?.stacks.filter((stack) => stack.id !== stackId) ?? [];
  const position =
    beforeStackId === null
      ? siblings.length
      : siblings.findIndex((stack) => stack.id === beforeStackId);
  if (position < 0) return Result.fail("The Stack insertion point no longer exists");
  if (destinationSection === undefined) {
    destinationSection = { id: newSectionId, stacks: [] };
    const sectionIndex =
      target.kind === "wall" && target.beforeSectionId !== null
        ? candidate.sections.findIndex((section) => section.id === target.beforeSectionId)
        : candidate.sections.length;
    candidate.sections.splice(sectionIndex, 0, destinationSection);
  }
  sourceSection.stacks.splice(sourceSection.stacks.indexOf(movingStack), 1);
  destinationSection.stacks.splice(position, 0, movingStack);
  pruneEmptyContainers(candidate);
  if (candidate.sections.some((section) => section.stacks.length > stackLimit))
    return Result.fail("This Section has reached its Stack limit");
  return Result.succeed(candidate);
}

/** Deletion prunes only the emptied ancestor path, preserving unrelated scaffolding. */
export function removePlacementFromLayout(props: {
  layout: typeof wallLayoutSchema.Type;
  placementId: IInferResource<typeof placementV1>["id"];
}) {
  const { layout, placementId } = props;
  const candidate = structuredClone(layout);
  for (const section of candidate.sections) {
    for (const stack of section.stacks) {
      for (const row of stack.rows) {
        const index = row.placementIds.indexOf(placementId);
        if (index < 0) continue;
        row.placementIds.splice(index, 1);
        if (row.placementIds.length === 0) stack.rows.splice(stack.rows.indexOf(row), 1);
        if (stack.rows.length === 0) section.stacks.splice(section.stacks.indexOf(stack), 1);
        if (section.stacks.length === 0)
          candidate.sections.splice(candidate.sections.indexOf(section), 1);
        return Result.succeed(candidate);
      }
    }
  }
  return Result.fail("The Placement no longer belongs to this Wall");
}
