import type { IInferDecodedRow } from "@zerospin/shapes";
import type { brickV1 } from "../models/brick/BrickV1";
import type { wallV1 } from "../models/wall/WallV1";
import type { sectionV1 } from "../models/section/SectionV1";
import type { stackV1 } from "../models/stack/StackV1";
import type { rowV1 } from "../models/row/RowV1";
import type { placementV1 } from "../models/placement/PlacementV1";
import type { PageSnapshotSchema } from "./pageSnapshotSchema";

export function makePageSnapshot(props: {
  page: Pick<typeof PageSnapshotSchema.Type, "slug" | "title" | "description">;
  bricks: readonly IInferDecodedRow<typeof brickV1.table.shape>[];
  walls: readonly IInferDecodedRow<typeof wallV1.table.shape>[];
  sections: readonly IInferDecodedRow<typeof sectionV1.table.shape>[];
  stacks: readonly IInferDecodedRow<typeof stackV1.table.shape>[];
  rows: readonly IInferDecodedRow<typeof rowV1.table.shape>[];
  placements: readonly IInferDecodedRow<typeof placementV1.table.shape>[];
}): typeof PageSnapshotSchema.Type {
  const { page, bricks, walls, sections, stacks, rows, placements } = props;
  const breakpointOrder = ["sm", "md", "lg", "xl"];
  return {
    slug: page.slug,
    title: page.title,
    description: page.description,
    bricks: [...bricks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({ id: entry.id, moduleId: entry.moduleId, state: entry.state })),
    walls: [...walls]
      .sort((a, b) => breakpointOrder.indexOf(a.breakpoint) - breakpointOrder.indexOf(b.breakpoint))
      .map((wall) => ({
        id: wall.id,
        breakpoint: wall.breakpoint,
        sections: sections
          .filter((entry) => entry.wallId === wall.id)
          .sort((a, b) => a.position - b.position)
          .map((section) => ({
            id: section.id,
            stacks: stacks
              .filter((entry) => entry.sectionId === section.id)
              .sort((a, b) => a.position - b.position)
              .map((stack) => ({
                id: stack.id,
                name: stack.name,
                rows: rows
                  .filter((entry) => entry.stackId === stack.id)
                  .sort((a, b) => a.position - b.position)
                  .map((row) => ({
                    id: row.id,
                    placements: placements
                      .filter((entry) => entry.rowId === row.id)
                      .sort((a, b) => a.position - b.position)
                      .map((entry) => ({ id: entry.id, brickId: entry.brickId, spec: entry.spec })),
                  })),
              })),
          })),
      })),
  };
}
