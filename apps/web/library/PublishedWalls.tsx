"use client";

import { reactLibrary } from "@qrk.sh/bricks/modules/reactLibrary";
import type { pageSnapshotSchema } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshotSchema";
import { WallViewer } from "./WallViewer";

export function PublishedWalls(props: {
  snapshot: typeof pageSnapshotSchema.Type;
  brickGap: number;
  cardStyle: boolean;
}) {
  const { snapshot, brickGap, cardStyle } = props;
  if (snapshot.walls.length !== 4 || new Set(snapshot.walls.map((wall) => wall.breakpoint)).size !== 4) {
    throw new Error("Published Page must contain one Wall for each breakpoint");
  }
  return (
    <div data-responsive-walls style={{ width: "100%", minWidth: 0 }}>
      {snapshot.walls.map((wall) => (
        <WallViewer
          key={wall.breakpoint}
          snapshot={snapshot}
          breakpoint={wall.breakpoint}
          brickGap={brickGap}
          renderBrick={(brick, placement) => {
            const Render = reactLibrary[brick.moduleId].Render;
            return (
              <div className={cardStyle ? "brick-hover-surface brick-surface-card h-full w-full" : "h-full w-full"}>
                <Render
                  brickState={brick.brickState}
                  placementState={placement.placementState}
                  layoutId={placement.layoutId}
                  spec={placement.spec}
                />
              </div>
            );
          }}
        />
      ))}
    </div>
  );
}
