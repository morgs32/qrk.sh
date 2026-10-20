import { WallBreakpointPane } from "@qrk.sh/library/WallBreakpointPane";
import { WallTree } from "@qrk.sh/library/WallTree";
import { WallModuleAction } from "@qrk.sh/library/WallModuleAction";
import type { wallInsertionTargetSchema } from "@qrk.sh/library/wallInsertionTargetSchema";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type ComponentProps } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

const meta = {
  title: "App/Studio/Pragmatic Tree",
  parameters: {
    layout: "centered",
    // The controlled fixture contains React content; don't serialize its owner graph.
    docs: { source: { type: "code", code: "<WallTree sections={sections} {...actions} />" } },
  },
  args: { width: 480, rowHeight: 40 },
  argTypes: {
    width: { control: { type: "range", min: 240, max: 640, step: 20 } },
    rowHeight: { control: { type: "range", min: 28, max: 56, step: 4 } },
  },
  render: function Render(props: { width: number; rowHeight: number }) {
    const { width, rowHeight } = props;
    const wallId = "story-wall-xl";
    const [selectedBrickId, setSelectedBrickId] = useState<string | null>(null);
    const [clicks, setClicks] = useState(0);
    const nextNumber = useRef(7);
    const [sections, setSections] = useState<ComponentProps<typeof WallTree>["sections"]>(() => [
      {
        id: "section-1",
        stacks: [
          {
            id: "stack-1",
            name: "Stack 1",
            rows: [
              {
                id: "row-1",
                placements: [
                  {
                    id: "placement-1",
                    brickId: "brick-1",
                    content: (
                      <button
                        type="button"
                        className="w-full bg-emerald-100 p-5 text-left"
                        onClick={() => setClicks((count) => count + 1)}
                      >
                        Live Brick 1
                      </button>
                    ),
                  },
                  {
                    id: "placement-2",
                    brickId: "brick-2",
                    content: <div className="bg-amber-100 p-5">Brick 2</div>,
                  },
                ],
              },
              {
                id: "row-2",
                placements: [
                  {
                    id: "placement-3",
                    brickId: "brick-3",
                    content: <div className="bg-sky-100 p-5">Brick 3</div>,
                  },
                ],
              },
            ],
          },
          {
            id: "stack-2",
            name: "Stack 2",
            rows: [
              {
                id: "row-3",
                placements: [
                  {
                    id: "placement-4",
                    brickId: "brick-4",
                    content: (
                      <label className="grid gap-2 bg-violet-100 p-5 text-sm">
                        Live input
                        <input
                          className="w-full min-w-0 border bg-white px-2 py-1"
                          placeholder="Type here"
                        />
                      </label>
                    ),
                  },
                ],
              },
              { id: "row-4", placements: [] },
            ],
          },
        ],
      },
      { id: "section-2", stacks: [{ id: "stack-3", name: "Stack 3", rows: [] }] },
    ]);

    // Resolve stable anchors first; preserve empty source containers in every move.
    function insertPlacement(
      target: typeof wallInsertionTargetSchema.Type,
      placementId?: string,
      moduleId = "Brick",
    ) {
      if (target.wallId !== wallId) return false;
      const source = sections
        .flatMap((section) =>
          section.stacks.flatMap((stack) => stack.rows.flatMap((row) => row.placements)),
        )
        .find((placement) => placement.id === placementId);
      if (placementId !== undefined && source === undefined) return false;
      const next = sections.map((section) => ({
        ...section,
        stacks: section.stacks.map((stack) => ({
          ...stack,
          rows: stack.rows.map((row) => ({
            ...row,
            placements: row.placements.filter((placement) => placement.id !== placementId),
          })),
        })),
      }));
      const number = nextNumber.current;
      const placement = source ?? {
        id: `placement-${number}`,
        brickId: `brick-${number}`,
        content: (
          <div className="bg-rose-100 p-5">
            {moduleId} {number}
          </div>
        ),
      };
      if (target.kind === "wall") {
        const index =
          target.beforeSectionId === null
            ? next.length
            : next.findIndex((section) => section.id === target.beforeSectionId);
        if (index < 0) return false;
        next.splice(index, 0, {
          id: `section-${number}`,
          stacks: [
            {
              id: `stack-${number}`,
              name: `Stack ${number}`,
              rows: [{ id: `row-${number}`, placements: [placement] }],
            },
          ],
        });
      } else if (target.kind === "section") {
        const section = next.find((entry) => entry.id === target.sectionId);
        if (!section || section.stacks.length >= 4) return false;
        section.stacks.push({
          id: `stack-${number}`,
          name: `Stack ${number}`,
          rows: [{ id: `row-${number}`, placements: [placement] }],
        });
      } else if (target.kind === "stack") {
        const stack = next
          .flatMap((section) => section.stacks)
          .find((entry) => entry.id === target.stackId);
        if (!stack) return false;
        const index =
          target.beforeRowId === null
            ? stack.rows.length
            : stack.rows.findIndex((row) => row.id === target.beforeRowId);
        if (index < 0) return false;
        stack.rows.splice(index, 0, { id: `row-${number}`, placements: [placement] });
      } else {
        const row = next
          .flatMap((section) => section.stacks.flatMap((stack) => stack.rows))
          .find((entry) => entry.id === target.rowId);
        if (!row) return false;
        const index =
          target.beforePlacementId === null
            ? row.placements.length
            : row.placements.findIndex((entry) => entry.id === target.beforePlacementId);
        if (index < 0) return false;
        row.placements.splice(index, 0, placement);
      }
      nextNumber.current += 1;
      setSections(next);
      return true;
    }

    return (
      <div className="grid gap-3" style={{ width }}>
        <div className="flex items-center justify-between border bg-background p-2 text-sm">
          <span>Module palette · live clicks: {clicks}</span>
          <WallModuleAction wallId={wallId} moduleId="Example" />
        </div>
        <p className="text-xs text-muted-foreground">
          Rows hold Bricks side by side. Drag the separate grips. This story edits local
          fixtures.
        </p>
        <style>{`[data-wall-editor="${wallId}"] [data-wall-placement] { min-height: ${rowHeight}px; }`}</style>
        <div className="bg-background text-foreground">
          <WallTree
            wallId={wallId}
            breakpoint="xl"
            sections={sections}
            selectedBrickId={selectedBrickId}
            onAddModule={(moduleId, target) => insertPlacement(target, undefined, moduleId)}
            onMovePlacement={(id, target) => insertPlacement(target, id)}
            onMoveStack={(stackId, target) => {
              if (target.wallId !== wallId) return false;
              const stack = sections
                .flatMap((section) => section.stacks)
                .find((entry) => entry.id === stackId);
              if (!stack) return false;
              const next = sections.map((section) => ({
                ...section,
                stacks: section.stacks.filter((entry) => entry.id !== stackId),
              }));
              if (target.kind === "wall") {
                const index =
                  target.beforeSectionId === null
                    ? next.length
                    : next.findIndex((section) => section.id === target.beforeSectionId);
                if (index < 0) return false;
                next.splice(index, 0, { id: `section-${nextNumber.current++}`, stacks: [stack] });
              } else {
                const section = next.find((entry) => entry.id === target.sectionId);
                if (!section || section.stacks.length >= 4) return false;
                const index =
                  target.beforeStackId === null
                    ? section.stacks.length
                    : section.stacks.findIndex((entry) => entry.id === target.beforeStackId);
                if (index < 0) return false;
                section.stacks.splice(index, 0, stack);
              }
              setSections(next);
              return true;
            }}
            onEditBrick={setSelectedBrickId}
            onDeleteBrick={(brickId) => {
              setSections((current) =>
                current.map((section) => ({
                  ...section,
                  stacks: section.stacks.map((stack) => ({
                    ...stack,
                    rows: stack.rows.map((row) => ({
                      ...row,
                      placements: row.placements.filter(
                        (placement) => placement.brickId !== brickId,
                      ),
                    })),
                  })),
                })),
              );
              if (selectedBrickId === brickId) setSelectedBrickId(null);
              return true;
            }}
          />
        </div>
        {selectedBrickId && (
          <form
            className="grid gap-2 border bg-background p-3 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              setSelectedBrickId(null);
            }}
          >
            <label>
              Selected Brick form
              <input defaultValue={selectedBrickId} className="ml-2 border bg-background px-2" />
            </label>
            <button type="submit" className="justify-self-start underline">
              Close form
            </button>
          </form>
        )}
      </div>
    );
  },
} satisfies Meta<{ width: number; rowHeight: number }>;

export default meta;
export const Default: StoryObj<typeof meta> = {};

export const ZoomedOut: StoryObj<typeof meta> = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="grid min-h-dvh place-items-center overflow-auto bg-muted/30 p-8 [--wall-frame-height:640px]">
        <TransformWrapper disabled initialScale={0.5} minScale={0.5} maxScale={0.5}>
          <TransformComponent
            wrapperStyle={{ width: 512, height: 320 }}
            contentStyle={{ width: 1024, height: 640 }}
          >
            <WallBreakpointPane
              breakpoint="lg"
              previewWidth={1024}
              isActive
              isOutgoing={false}
              isOnStage
              isTransitioning={false}
              direction={0}
              reducedMotion
              onOutgoingComplete={() => {}}
            >
              <div className="min-h-0 flex-1 overflow-auto bg-background p-8">
                <Story />
              </div>
            </WallBreakpointPane>
          </TransformComponent>
        </TransformWrapper>
      </div>
    ),
  ],
};
