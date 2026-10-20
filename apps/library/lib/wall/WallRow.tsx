import { Fragment, type ComponentProps } from "react";
import { InsertionSeparator } from "./InsertionSeparator";
import { WallPlacement } from "./WallPlacement";
import type { WallTree } from "./WallTree";

export function WallRow(props: {
  row: ComponentProps<typeof WallTree>["sections"][number]["stacks"][number]["rows"][number];
  wallId: string;
  scope: string;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestMove: ComponentProps<typeof WallPlacement>["onRequestMove"];
  onRequestDelete: ComponentProps<typeof WallPlacement>["onRequestDelete"];
}) {
  const { row, wallId, scope, selectedBrickId, onEditBrick, onRequestMove, onRequestDelete } =
    props;
  return (
    <div data-wall-row={row.id} className="flex min-w-0 items-start">
      {row.placements.map((placement) => (
        <Fragment key={placement.id}>
          <InsertionSeparator
            label={`Insert Brick before ${placement.brickId}`}
            orientation="vertical"
            target={{ wallId, kind: "row", rowId: row.id, beforePlacementId: placement.id }}
          />
          <WallPlacement
            placement={placement}
            scope={scope}
            selected={selectedBrickId === placement.brickId}
            onEditBrick={onEditBrick}
            onRequestMove={onRequestMove}
            onRequestDelete={onRequestDelete}
          />
        </Fragment>
      ))}
      {row.placements.length === 0 && (
        <div
          className="min-h-12 flex-1 border border-dashed border-zinc-200"
          aria-label="Empty Row"
        />
      )}
      <InsertionSeparator
        label="Insert Brick at end of Row"
        orientation="vertical"
        target={{ wallId, kind: "row", rowId: row.id, beforePlacementId: null }}
      />
    </div>
  );
}
