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
      className="relative min-w-0 border border-transparent p-1 data-[drop-active=true]:border-blue-500"
    >
      <div
        className="grid min-w-0 items-start gap-2"
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
          className="mt-1 h-7 w-full rounded-none border border-dashed border-zinc-200 px-2 text-xs text-muted-foreground"
          data-wall-insertion={JSON.stringify({ wallId, kind: "section", sectionId: section.id })}
          onClick={() => onAdd({ wallId, kind: "section", sectionId: section.id })}
        >
          + Brick in new Stack
        </Button>
      )}
    </section>
  );
}
