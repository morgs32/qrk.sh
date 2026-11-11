import {
  allocateRowWidths,
  allocateStackWidths,
  measureWallFit,
  wallBreakpointWidths,
} from "@qrk.sh/zerospin/src/aggregates/user/layout/wallSizing";
import type { PageSnapshotSchemaV4 } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/pageSnapshotSchemaV4";
import { backendLibrary } from "@qrk.sh/bricks/definition/backendLibrary";
import type { ReactNode } from "react";

export function WallViewer(props: {
  snapshot: typeof PageSnapshotSchemaV4.Type;
  breakpoint: keyof typeof wallBreakpointWidths;
  brickGap: number;
  renderBrick: (
    brick: (typeof PageSnapshotSchemaV4.Type.bricks)[number],
    placement: (typeof PageSnapshotSchemaV4.Type.walls)[number]["sections"][number]["stacks"][number]["rows"][number]["placements"][number],
  ) => ReactNode;
}) {
  const { snapshot, breakpoint, brickGap, renderBrick } = props;
  const wall = snapshot.walls.find((entry) => entry.breakpoint === breakpoint);
  if (wall === undefined) throw new Error(`Snapshot has no ${breakpoint} Wall`);

  const bricks = new Map(snapshot.bricks.map((brick) => [brick.id, brick]));
  const placementMinimumWidths = new Map<string, number>();
  const sections = wall.sections.map((section) => ({
    ...section,
    stacks: section.stacks.map((stack) => ({
      ...stack,
      rows: stack.rows.map((row) => ({
        ...row,
        placementIds: row.placements.map((placement) => placement.id),
        placements: row.placements.map((placement) => {
          const brick = bricks.get(placement.brickId);
          if (brick === undefined)
            throw new Error(
              `Placement ${placement.id} references missing Brick ${placement.brickId}`,
            );
          const variant = backendLibrary[brick.moduleId].variants[placement.variantId];
          placementMinimumWidths.set(placement.id, variant.minWidth);
          return { brick, placement, variant };
        }),
      })),
    })),
  }));

  const wallWidth = wallBreakpointWidths[breakpoint];
  const sectionFits = measureWallFit({
    layout: { sections },
    placementMinimumWidths,
    wallWidth,
    brickGap,
  });

  return (
    <div
      data-wall-id={wall.id}
      data-wall-breakpoint={breakpoint}
      style={{ display: "flex", flexDirection: "column", width: wallWidth, gap: brickGap }}
    >
      {sections.map((section, sectionIndex) => {
        const stackWidths = allocateStackWidths({
          minimumWidths: sectionFits[sectionIndex].stackMinimums,
          availableWidth: wallWidth + brickGap,
        }).map((width) => width - brickGap);

        return (
          <section
            key={section.id}
            data-wall-section-id={section.id}
            style={{
              display: "grid",
              gridTemplateColumns: stackWidths.map((width) => `${width}px`).join(" "),
              gap: brickGap,
            }}
          >
            {section.stacks.map((stack, stackIndex) => (
              <div
                key={stack.id}
                data-wall-stack-id={stack.id}
                style={{ display: "flex", flexDirection: "column", gap: brickGap }}
              >
                {stack.rows.map((row) => {
                  const stackWidth = stackWidths[stackIndex];
                  const { contentWidth, widths } = allocateRowWidths({
                    stackWidth,
                    brickGap,
                    minimums: row.placements.map(({ variant }) => variant.minWidth),
                    weights: row.placements.map(({ placement }) => placement.widthWeight),
                    preferredWidth: row.preferredWidth ?? null,
                  });
                  const minHeight = Math.max(
                    45,
                    row.minHeight ?? 45,
                    ...row.placements.map(({ variant }) =>
                      Math.max(
                        variant.minHeight ?? 45,
                        row.minHeight ?? variant.defaultHeight ?? 45,
                      ),
                    ),
                  );

                  return (
                    <div
                      key={row.id}
                      data-wall-row-id={row.id}
                      style={{
                        display: "flex",
                        width: contentWidth,
                        minHeight,
                        gap: brickGap,
                        marginInlineStart:
                          row.alignment === "right"
                            ? "auto"
                            : row.alignment === "center"
                              ? (stackWidth - contentWidth) / 2
                              : 0,
                      }}
                    >
                      {row.placements.map(({ brick, placement }, placementIndex) => (
                        <div
                          key={placement.id}
                          data-wall-placement-id={placement.id}
                          style={{
                            display: "grid",
                            boxSizing: "border-box",
                            flex: `0 0 ${widths[placementIndex]}px`,
                            minWidth: 0,
                            borderWidth: brick.borderWidth,
                            borderStyle: "solid",
                          }}
                        >
                          {renderBrick(brick, placement)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
