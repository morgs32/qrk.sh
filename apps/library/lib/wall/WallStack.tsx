import type { ComponentProps } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "../../components/ui/button";
import { WallRow } from "./WallRow";
import type { WallTree } from "./WallTree";

export function WallStack(props: {
  stack: ComponentProps<typeof WallTree>["sections"][number]["stacks"][number];
  scope: string;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestDelete: ComponentProps<typeof WallRow>["onRequestDelete"];
}) {
  const {
    stack,
    scope,
    selectedBrickId,
    onEditBrick,
    onRequestDelete,
  } = props;
  return (
    <div
      data-wall-stack={stack.id}
      className="group/stack relative min-w-0 outline outline-1 -outline-offset-1 outline-transparent hover:outline-zinc-200 focus-within:outline-zinc-200"
    >
      <div className="absolute left-0 top-0 z-30 flex h-7 max-w-[calc(100%-3.5rem)] items-center gap-1 bg-background/95 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/stack:opacity-100 group-focus-within/stack:opacity-100 group-data-[dragging=true]/wall:pointer-events-none group-data-[dragging=true]/wall:invisible motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
        <Button
          id={`${scope}-stack-grip-${stack.id}`}
          variant="ghost"
          className="size-7 cursor-grab rounded-none p-0 active:cursor-grabbing"
          data-stack-grip
          aria-label={`Drag ${stack.name}`}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </Button>
        <span className="min-w-0 truncate">{stack.name}</span>
      </div>
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
