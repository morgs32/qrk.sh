import { Fragment, type ComponentProps } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "../../components/ui/button";
import { InsertionSeparator } from "./InsertionSeparator";
import { WallRow } from "./WallRow";
import type { WallTree } from "./WallTree";

export function WallStack(props: {
  stack: ComponentProps<typeof WallTree>["sections"][number]["stacks"][number];
  wallId: string;
  scope: string;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestMovePlacement: ComponentProps<typeof WallRow>["onRequestMove"];
  onRequestDelete: ComponentProps<typeof WallRow>["onRequestDelete"];
  onRequestMoveStack: (id: string, triggerId: string) => void;
}) {
  const {
    stack,
    wallId,
    scope,
    selectedBrickId,
    onEditBrick,
    onRequestMovePlacement,
    onRequestDelete,
    onRequestMoveStack,
  } = props;
  return (
    <div
      data-wall-stack={stack.id}
      className="group/stack relative min-w-0 outline outline-1 -outline-offset-1 outline-transparent hover:outline-zinc-200 focus-within:outline-zinc-200 data-[drop-active=true]:outline-blue-500 before:pointer-events-none before:absolute before:inset-y-0 before:z-40 before:w-0.5 data-[drop-side=left]:before:left-0 data-[drop-side=left]:before:bg-blue-500 data-[drop-side=right]:before:right-0 data-[drop-side=right]:before:bg-blue-500"
    >
      <div className="absolute left-0 top-0 z-30 flex h-7 max-w-[calc(100%-3.5rem)] items-center gap-1 bg-background/95 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/stack:opacity-100 group-focus-within/stack:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
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
        <Button
          id={`${scope}-stack-move-${stack.id}`}
          variant="ghost"
          className="h-7 rounded-none px-2 text-xs"
          onClick={() => onRequestMoveStack(stack.id, `${scope}-stack-move-${stack.id}`)}
        >
          Move…
        </Button>
      </div>
      {stack.rows.map((row) => (
        <Fragment key={row.id}>
          <InsertionSeparator
            label={`Insert Row before ${row.id}`}
            target={{ wallId, kind: "stack", stackId: stack.id, beforeRowId: row.id }}
          />
          <WallRow
            row={row}
            wallId={wallId}
            scope={scope}
            selectedBrickId={selectedBrickId}
            onEditBrick={onEditBrick}
            onRequestMove={onRequestMovePlacement}
            onRequestDelete={onRequestDelete}
          />
        </Fragment>
      ))}
      {stack.rows.length === 0 && (
        <div className="min-h-16 border border-dashed border-zinc-200" aria-label="Empty Stack" />
      )}
      <InsertionSeparator
        label={`Insert Row at end of ${stack.name}`}
        target={{ wallId, kind: "stack", stackId: stack.id, beforeRowId: null }}
      />
    </div>
  );
}
