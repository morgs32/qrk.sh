import type { ComponentProps } from "react";
import { WallPlacement } from "./WallPlacement";
import type { WallTree } from "./WallTree";

export function WallRow(props: {
  row: ComponentProps<typeof WallTree>["sections"][number]["stacks"][number]["rows"][number];
  scope: string;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestDelete: ComponentProps<typeof WallPlacement>["onRequestDelete"];
}) {
  const { row, scope, selectedBrickId, onEditBrick, onRequestDelete } = props;
  return (
    <div data-wall-row={row.id} className="relative min-w-0">
      <div
        role="group"
        aria-label={`Row ${row.id}`}
        tabIndex={0}
        className="flex min-w-0 w-full items-start overflow-x-auto overflow-y-hidden"
      >
        {row.placements.map((placement) => (
          <WallPlacement
            key={placement.id}
            placement={placement}
            scope={scope}
            selected={selectedBrickId === placement.brickId}
            onEditBrick={onEditBrick}
            onRequestDelete={onRequestDelete}
          />
        ))}
        {row.placements.length === 0 && (
          <div
            className="min-h-12 flex-1 border border-dashed border-zinc-200"
            aria-label="Empty Row"
          />
        )}
      </div>
    </div>
  );
}
