import type { ComponentProps } from "react";
import { DragHandle } from "../../components/DragHandle";
import { StackAction } from "../../components/StackAction";
import { WallRow } from "./WallRow";
import type { WallTree } from "./WallTree";

export function WallStack(props: {
  stack: ComponentProps<typeof WallTree>["sections"][number]["stacks"][number];
  scope: string;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestDelete: ComponentProps<typeof WallRow>["onRequestDelete"];
}) {
  const { stack, scope, selectedBrickId, onEditBrick, onRequestDelete } = props;
  return (
    <div
      data-wall-stack={stack.id}
      className="group/stack relative min-w-0 outline outline-1 -outline-offset-1 outline-transparent hover:outline-zinc-200 focus-within:outline-zinc-200"
    >
      <StackAction>
        <DragHandle
          id={`${scope}-stack-grip-${stack.id}`}
          data-stack-grip
          aria-label={`Drag ${stack.name}`}
        />
        <span className="min-w-0 truncate">{stack.name}</span>
      </StackAction>
      {stack.rows.map((row) => (
        <WallRow
          key={row.id}
          row={row}
          scope={scope}
          selectedBrickId={selectedBrickId}
          onEditBrick={onEditBrick}
          onRequestDelete={onRequestDelete}
        />
      ))}
      {stack.rows.length === 0 && (
        <div className="min-h-16 border border-dashed border-zinc-200" aria-label="Empty Stack" />
      )}
    </div>
  );
}
