import type { ComponentProps } from "react";
import { Button } from "../../components/ui/button";
import { WallStack } from "./WallStack";
import type { WallTree } from "./WallTree";

export function WallSection(props: {
  section: ComponentProps<typeof WallTree>["sections"][number];
  wallId: string;
  scope: string;
  stackLimit: number;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onAdd: ComponentProps<typeof WallTree>["onAdd"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestMovePlacement: ComponentProps<typeof WallStack>["onRequestMovePlacement"];
  onRequestMoveStack: ComponentProps<typeof WallStack>["onRequestMoveStack"];
  onRequestDelete: ComponentProps<typeof WallStack>["onRequestDelete"];
}) {
  const {
    section,
    wallId,
    scope,
    stackLimit,
    selectedBrickId,
    onAdd,
    onEditBrick,
    onRequestMovePlacement,
    onRequestMoveStack,
    onRequestDelete,
  } = props;
  return (
    <section
      data-wall-section={section.id}
      aria-label={`Section ${section.id}`}
      className={`group/section relative min-w-0 outline outline-1 -outline-offset-1 outline-transparent data-[drop-active=true]:outline-blue-500 ${section.stacks.length === 0 ? "min-h-7" : ""}`}
    >
      <div
        className="grid min-w-0 items-start"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, section.stacks.length)}, minmax(0, 1fr))`,
        }}
      >
        {section.stacks.map((stack) => (
          <WallStack
            key={stack.id}
            stack={stack}
            wallId={wallId}
            scope={scope}
            selectedBrickId={selectedBrickId}
            onAdd={onAdd}
            onEditBrick={onEditBrick}
            onRequestMovePlacement={onRequestMovePlacement}
            onRequestMoveStack={onRequestMoveStack}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
      {section.stacks.length < stackLimit && (
        <Button
          variant="ghost"
          className={`absolute bottom-0 right-0 z-20 h-7 rounded-none border border-dashed border-zinc-200 bg-background/95 px-2 text-xs text-muted-foreground transition-opacity focus-visible:opacity-100 data-[drop-active=true]:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100 ${section.stacks.length === 0 ? "opacity-100" : "opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100"}`}
          data-wall-insertion={JSON.stringify({ wallId, kind: "section", sectionId: section.id })}
          onClick={() => onAdd({ wallId, kind: "section", sectionId: section.id })}
        >
          + Brick in new Stack
        </Button>
      )}
    </section>
  );
}
