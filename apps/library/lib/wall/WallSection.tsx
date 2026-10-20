import type { ComponentProps } from "react";
import { WallStack } from "./WallStack";
import type { WallTree } from "./WallTree";

export function WallSection(props: {
  section: ComponentProps<typeof WallTree>["sections"][number];
  wallId: string;
  scope: string;
  stackLimit: number;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestDelete: ComponentProps<typeof WallStack>["onRequestDelete"];
}) {
  const {
    section,
    wallId,
    scope,
    stackLimit,
    selectedBrickId,
    onEditBrick,
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
            onEditBrick={onEditBrick}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
      {section.stacks.length < stackLimit && (
        <div
          aria-hidden="true"
          aria-label="New Stack drop target"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 opacity-0 group-data-[dragging=true]/wall:pointer-events-auto data-[drop-active=true]:bg-blue-500/20 data-[drop-active=true]:opacity-100"
          data-wall-insertion={JSON.stringify({ wallId, kind: "section", sectionId: section.id })}
        />
      )}
    </section>
  );
}
