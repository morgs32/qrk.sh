import { Result } from "effect";
import type { wallLayoutSchemaV2 } from "./wallLayoutSchemaV2";
import type { sectionIdSchema, stackIdSchema, rowIdSchema } from "./wallLayoutSchema";
import type { wallInsertionTargetSchema, stackMoveTargetSchema } from "./wallTargetSchemas";
import type { placementV2 } from "../models/placement/PlacementV2";
import type { IInferResource } from "@zerospin/core/models/types";

/** Edit a private candidate; callers decide whether additions or movement own capacity checks. */
function insertIntoLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  target: typeof wallInsertionTargetSchema.Type;
  placementId: IInferResource<typeof placementV2>["id"];
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

/** Prune only the Row and ancestors emptied by the moved Placement. */
function pruneSourceContainers(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  sourceRow: (typeof wallLayoutSchemaV2.Type)["sections"][number]["stacks"][number]["rows"][number];
}) {
  const { layout, sourceRow } = props;
  if (sourceRow.placementIds.length > 0) return;
  for (const section of layout.sections) {
    const stack = section.stacks.find((entry) => entry.rows.includes(sourceRow));
    if (stack === undefined) continue;
    stack.rows.splice(stack.rows.indexOf(sourceRow), 1);
    if (stack.rows.length === 0) section.stacks.splice(section.stacks.indexOf(stack), 1);
    if (section.stacks.length === 0) layout.sections.splice(layout.sections.indexOf(section), 1);
    return;
  }
}

export function insertPlacementInLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  target: typeof wallInsertionTargetSchema.Type;
  placementId: IInferResource<typeof placementV2>["id"];
  newNodeIds: {
    sectionId: typeof sectionIdSchema.Type;
    stackId: typeof stackIdSchema.Type;
    rowId: typeof rowIdSchema.Type;
  };
}) {
  const { layout, target, placementId, newNodeIds } = props;
  const inserted = insertIntoLayout({
    layout: structuredClone(layout),
    target,
    placementId,
    newNodeIds,
  });
  if (Result.isFailure(inserted)) return inserted;
  return inserted;
}

/** Move to an existing Row without allocating any layout identities. */
export function movePlacementToRowInLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  placementId: IInferResource<typeof placementV2>["id"];
  rowId: typeof rowIdSchema.Type;
  beforePlacementId: IInferResource<typeof placementV2>["id"] | null;
}) {
  const { layout, placementId, rowId, beforePlacementId } = props;
  const candidate = structuredClone(layout);
  const rows = candidate.sections.flatMap((section) =>
    section.stacks.flatMap((stack) => stack.rows),
  );
  const sourceRow = rows.find((row) => row.placementIds.includes(placementId));
  const destinationRow = rows.find((row) => row.id === rowId);
  if (sourceRow === undefined) return Result.fail("The Placement no longer belongs to this Wall");
  if (destinationRow === undefined) return Result.fail("The destination Row no longer exists");
  if (beforePlacementId !== null && !destinationRow.placementIds.includes(beforePlacementId))
    return Result.fail("The Placement insertion point no longer exists");
  const sourceIndex = sourceRow.placementIds.indexOf(placementId);
  if (
    sourceRow === destinationRow &&
    (beforePlacementId === placementId ||
      beforePlacementId === (sourceRow.placementIds[sourceIndex + 1] ?? null))
  )
    return Result.succeed(layout);
  sourceRow.placementIds.splice(sourceIndex, 1);
  const position =
    beforePlacementId === null
      ? destinationRow.placementIds.length
      : destinationRow.placementIds.indexOf(beforePlacementId);
  destinationRow.placementIds.splice(position, 0, placementId);
  pruneSourceContainers({ layout: candidate, sourceRow });
  return Result.succeed(candidate);
}

/** Create one named Row identity at the selected Stack position and move into it. */
export function movePlacementToNewRowInLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  placementId: IInferResource<typeof placementV2>["id"];
  stackId: typeof stackIdSchema.Type;
  newRowId: typeof rowIdSchema.Type;
  beforeRowId: typeof rowIdSchema.Type | null;
}) {
  const { layout, placementId, stackId, newRowId, beforeRowId } = props;
  const candidate = structuredClone(layout);
  const stacks = candidate.sections.flatMap((section) => section.stacks);
  const sourceRow = stacks
    .flatMap((stack) => stack.rows)
    .find((row) => row.placementIds.includes(placementId));
  const destinationStack = stacks.find((stack) => stack.id === stackId);
  if (sourceRow === undefined) return Result.fail("The Placement no longer belongs to this Wall");
  if (destinationStack === undefined) return Result.fail("The destination Stack no longer exists");
  if (beforeRowId !== null && !destinationStack.rows.some((row) => row.id === beforeRowId))
    return Result.fail("The Row insertion point no longer exists");
  const nodeIds = new Set(
    candidate.sections.flatMap((section) => [
      section.id,
      ...section.stacks.flatMap((stack) => [stack.id, ...stack.rows.map((row) => row.id)]),
    ]),
  );
  if (nodeIds.has(newRowId)) return Result.fail("The new Row ID already belongs to this Wall");
  sourceRow.placementIds.splice(sourceRow.placementIds.indexOf(placementId), 1);
  const position =
    beforeRowId === null
      ? destinationStack.rows.length
      : destinationStack.rows.findIndex((row) => row.id === beforeRowId);
  destinationStack.rows.splice(position, 0, {
    id: newRowId,
    minHeight: null,
    placementIds: [placementId],
  });
  pruneSourceContainers({ layout: candidate, sourceRow });
  return Result.succeed(candidate);
}

/** Append a new Stack with its explicit first Row and move into that Row. */
export function movePlacementToNewStackInLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  placementId: IInferResource<typeof placementV2>["id"];
  sectionId: typeof sectionIdSchema.Type;
  newStackId: typeof stackIdSchema.Type;
  newRowId: typeof rowIdSchema.Type;
}) {
  const { layout, placementId, sectionId, newStackId, newRowId } = props;
  const candidate = structuredClone(layout);
  const sourceRow = candidate.sections
    .flatMap((section) => section.stacks)
    .flatMap((stack) => stack.rows)
    .find((row) => row.placementIds.includes(placementId));
  const destinationSection = candidate.sections.find((section) => section.id === sectionId);
  if (sourceRow === undefined) return Result.fail("The Placement no longer belongs to this Wall");
  if (destinationSection === undefined)
    return Result.fail("The destination Section no longer exists");
  const nodeIds = new Set(
    candidate.sections.flatMap((section) => [
      section.id,
      ...section.stacks.flatMap((stack) => [stack.id, ...stack.rows.map((row) => row.id)]),
    ]),
  );
  if (nodeIds.has(newStackId) || nodeIds.has(newRowId))
    return Result.fail("New layout IDs must be distinct and unused in this Wall");
  sourceRow.placementIds.splice(sourceRow.placementIds.indexOf(placementId), 1);
  destinationSection.stacks.push({
    id: newStackId,
    name: "Stack",
    rows: [{ id: newRowId, minHeight: null, placementIds: [placementId] }],
  });
  pruneSourceContainers({ layout: candidate, sourceRow });
  return Result.succeed(candidate);
}

/** Insert an explicit Section/Stack/Row hierarchy and move into its only Row. */
export function movePlacementToNewSectionInLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  placementId: IInferResource<typeof placementV2>["id"];
  newSectionId: typeof sectionIdSchema.Type;
  newStackId: typeof stackIdSchema.Type;
  newRowId: typeof rowIdSchema.Type;
  beforeSectionId: typeof sectionIdSchema.Type | null;
}) {
  const { layout, placementId, newSectionId, newStackId, newRowId, beforeSectionId } = props;
  const candidate = structuredClone(layout);
  const sourceRow = candidate.sections
    .flatMap((section) => section.stacks)
    .flatMap((stack) => stack.rows)
    .find((row) => row.placementIds.includes(placementId));
  if (sourceRow === undefined) return Result.fail("The Placement no longer belongs to this Wall");
  if (
    beforeSectionId !== null &&
    !candidate.sections.some((section) => section.id === beforeSectionId)
  )
    return Result.fail("The Section insertion point no longer exists");
  const nodeIds = new Set(
    candidate.sections.flatMap((section) => [
      section.id,
      ...section.stacks.flatMap((stack) => [stack.id, ...stack.rows.map((row) => row.id)]),
    ]),
  );
  const newIds = [newSectionId, newStackId, newRowId];
  if (new Set(newIds).size !== newIds.length || newIds.some((id) => nodeIds.has(id)))
    return Result.fail("New layout IDs must be distinct and unused in this Wall");
  sourceRow.placementIds.splice(sourceRow.placementIds.indexOf(placementId), 1);
  const position =
    beforeSectionId === null
      ? candidate.sections.length
      : candidate.sections.findIndex((section) => section.id === beforeSectionId);
  candidate.sections.splice(position, 0, {
    id: newSectionId,
    stacks: [
      {
        id: newStackId,
        name: "Stack",
        rows: [{ id: newRowId, minHeight: null, placementIds: [placementId] }],
      },
    ],
  });
  pruneSourceContainers({ layout: candidate, sourceRow });
  return Result.succeed(candidate);
}

export function moveStackInLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  target: typeof stackMoveTargetSchema.Type;
  stackId: typeof stackIdSchema.Type;
  newSectionId: typeof sectionIdSchema.Type;
}) {
  const { layout, target, stackId, newSectionId } = props;
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
    if (candidate.sections.some((section) => section.id === newSectionId))
      return Result.fail("The new Section ID already belongs to this Wall");
    destinationSection = { id: newSectionId, stacks: [] };
    const sectionIndex =
      target.kind === "wall" && target.beforeSectionId !== null
        ? candidate.sections.findIndex((section) => section.id === target.beforeSectionId)
        : candidate.sections.length;
    candidate.sections.splice(sectionIndex, 0, destinationSection);
  }
  sourceSection.stacks.splice(sourceSection.stacks.indexOf(movingStack), 1);
  destinationSection.stacks.splice(position, 0, movingStack);
  if (sourceSection.stacks.length === 0)
    candidate.sections.splice(candidate.sections.indexOf(sourceSection), 1);
  return Result.succeed(candidate);
}

/** Deletion prunes only the emptied ancestor path, preserving unrelated scaffolding. */
export function removePlacementFromLayout(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  placementId: IInferResource<typeof placementV2>["id"];
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
