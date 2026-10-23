import type { ComponentProps } from "react";
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
    <div className="group/stack relative min-w-0 outline outline-1 -outline-offset-1 outline-transparent hover:outline-zinc-200 focus-within:outline-zinc-200">
      <StackAction>
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
    </div>
  );
}
