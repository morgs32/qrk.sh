import type { IRecordingOperations } from "@zerospin/core/contracts/operationDescriptor";
import type { IInferResource } from "@zerospin/core/models/types";
import { Effect } from "effect";
import { sectionV1 as section } from "../../../models/section/SectionV1";
import { stackV1 as stack } from "../../../models/stack/StackV1";
import { rowV1 as row } from "../../../models/row/RowV1";
import { placementV1 as placement } from "../../../models/placement/PlacementV1";

/** Normalize the command's post-edit hierarchy; database reads still describe its pre-edit state. */
export const cleanupWall = Effect.fn("cleanupWall")(function* (props: {
  sections: {
    id: IInferResource<typeof section>["id"];
    position: number;
    stacks: {
      id: IInferResource<typeof stack>["id"];
      position: number;
      rows: {
        id: IInferResource<typeof row>["id"];
        position: number;
        placements: {
          id: IInferResource<typeof placement>["id"];
          position: number;
        }[];
      }[];
    }[];
  }[];
  operations: IRecordingOperations<{
    updatePlacement: typeof placement.operations.update;
    deleteRow: typeof row.operations.delete;
    updateRow: typeof row.operations.update;
    deleteStack: typeof stack.operations.delete;
    updateStack: typeof stack.operations.update;
    deleteSection: typeof section.operations.delete;
    updateSection: typeof section.operations.update;
  }>;
}) {
  const { sections, operations } = props;
  const survivingSections: typeof sections = [];
  for (const currentSection of sections) {
    const survivingStacks: typeof currentSection.stacks = [];
    for (const currentStack of currentSection.stacks) {
      const survivingRows: typeof currentStack.rows = [];
      for (const currentRow of currentStack.rows) {
        if (currentRow.placements.length === 0) {
          yield* operations.deleteRow({ resourceId: currentRow.id });
          continue;
        }
        yield* Effect.forEach(currentRow.placements, (entry, position) => {
          if (entry.position === position) return Effect.void;
          entry.position = position;
          return operations.updatePlacement({ resourceId: entry.id, attributes: { position } });
        });
        const position = survivingRows.length;
        if (currentRow.position !== position) {
          currentRow.position = position;
          yield* operations.updateRow({ resourceId: currentRow.id, attributes: { position } });
        }
        survivingRows.push(currentRow);
      }
      currentStack.rows = survivingRows;
      if (currentStack.rows.length === 0) {
        yield* operations.deleteStack({ resourceId: currentStack.id });
        continue;
      }
      const position = survivingStacks.length;
      if (currentStack.position !== position) {
        currentStack.position = position;
        yield* operations.updateStack({ resourceId: currentStack.id, attributes: { position } });
      }
      survivingStacks.push(currentStack);
    }
    currentSection.stacks = survivingStacks;
    if (currentSection.stacks.length === 0) {
      yield* operations.deleteSection({ resourceId: currentSection.id });
      continue;
    }
    const position = survivingSections.length;
    if (currentSection.position !== position) {
      currentSection.position = position;
      yield* operations.updateSection({ resourceId: currentSection.id, attributes: { position } });
    }
    survivingSections.push(currentSection);
  }
  sections.splice(0, sections.length, ...survivingSections);
});
