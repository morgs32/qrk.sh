import type { ComponentProps } from "react";
import { WallStack } from "./WallStack";
import type { WallTree } from "./WallTree";

export function WallSection(props: {
  section: ComponentProps<typeof WallTree>["sections"][number];
  scope: string;
  selectedBrickId: ComponentProps<typeof WallTree>["selectedBrickId"];
  onEditBrick: ComponentProps<typeof WallTree>["onEditBrick"];
  onRequestDelete: ComponentProps<typeof WallStack>["onRequestDelete"];
}) {
  const {
    section,
    scope,
    selectedBrickId,
    onEditBrick,
    onRequestDelete,
  } = props;
  return (
    <section
      data-wall-section={section.id}
      aria-label={`Section ${section.id}`}
      className={`group/section relative min-w-0 outline outline-1 -outline-offset-1 outline-transparent ${section.stacks.length === 0 ? "min-h-7" : ""}`}
    >
      <div
        className="grid min-w-0 items-stretch"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, section.stacks.length)}, minmax(0, 1fr))`,
        }}
      >
        {section.stacks.map((stack) => (
          <WallStack
            key={stack.id}
            stack={stack}
            scope={scope}
            selectedBrickId={selectedBrickId}
            onEditBrick={onEditBrick}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
    </section>
  );
}
