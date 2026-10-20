import { Dialog } from "@base-ui/react/dialog";
import { announce, cleanup } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
  type ElementDropTargetEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { Result, Schema } from "effect";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/list-item";
import { Button } from "../../components/ui/button";
import { WallMoveDialog } from "./WallMoveDialog";
import { WallSection } from "./WallSection";
import { stackMoveTargetSchema, wallInsertionTargetSchema } from "./wallInsertionTargetSchema";

/** Controlled wall presentation: the caller owns persistence or local story fixtures. */
export function WallTree(props: {
  wallId: string;
  breakpoint: "sm" | "md" | "lg" | "xl";
  sections: {
    id: string;
    stacks: {
      id: string;
      name: string;
      rows: { id: string; placements: { id: string; brickId: string; content: ReactNode }[] }[];
    }[];
  }[];
  selectedBrickId?: string | null;
  isActive?: boolean;
  onAddModule?: (moduleId: string, target: typeof wallInsertionTargetSchema.Type) => boolean | void;
  onMovePlacement: (
    placementId: string,
    target: typeof wallInsertionTargetSchema.Type,
  ) => boolean | void;
  onMoveStack: (stackId: string, target: typeof stackMoveTargetSchema.Type) => boolean | void;
  onEditBrick: (brickId: string) => void;
  onDeleteBrick: (brickId: string) => boolean | void;
}) {
  const {
    wallId,
    breakpoint,
    sections,
    selectedBrickId,
    isActive = true,
    onAddModule,
    onMovePlacement,
    onMoveStack,
    onEditBrick,
    onDeleteBrick,
  } = props;
  const scope = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const [moving, setMoving] = useState<{ kind: "placement" | "stack"; id: string } | null>(null);
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{
    element: HTMLElement;
    instruction: Instruction;
  } | null>(null);
  const stackLimit = { sm: 1, md: 2, lg: 3, xl: 4 }[breakpoint];

  useEffect(() => cleanup, []);
  useEffect(() => {
    if (!isActive) {
      setMoving(null);
      setDeletingBrickId(null);
    }
  }, [isActive]);

  // 1. Register only this mounted, active Wall. Content remains interactive; grips drag.
  useEffect(() => {
    const root = rootRef.current;
    const sectionList = sectionsRef.current;
    if (!root || !sectionList || !isActive) return;
    const disposers: (() => void)[] = [];
    const stacks = sections.flatMap((section) =>
      section.stacks.map((stack) => ({ ...stack, sectionId: section.id })),
    );
    const rows = stacks.flatMap((stack) =>
      stack.rows.map((row) => ({ ...row, stackId: stack.id })),
    );
    const placements = rows.flatMap((row) =>
      row.placements.map((placement) => ({ ...placement, rowId: row.id })),
    );
    const accepts = (data: Record<string | symbol, unknown>) =>
      data.wallId === wallId &&
      (data.kind === "wall-module"
        ? onAddModule !== undefined && typeof data.moduleId === "string"
        : data.scope === scope &&
          ((data.kind === "placement" && placements.some((entry) => entry.id === data.id)) ||
            (data.kind === "stack" && stacks.some((entry) => entry.id === data.id))));
    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-wall-stack], [data-wall-placement]",
    )) {
      const kind = element.hasAttribute("data-wall-stack") ? "stack" : "placement";
      const id = element.getAttribute(kind === "stack" ? "data-wall-stack" : "data-wall-placement");
      const grip = element.querySelector<HTMLButtonElement>(
        kind === "stack" ? "[data-stack-grip]" : "[data-placement-grip]",
      );
      if (id === null || grip === null) continue;
      disposers.push(
        draggable({
          element,
          dragHandle: grip,
          getInitialData: () => ({ kind, id, scope, wallId }),
          onGenerateDragPreview: ({ nativeSetDragImage }) =>
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
              render: ({ container }) => {
                const preview = root.ownerDocument.createElement("div");
                preview.className =
                  "border bg-background px-3 py-2 text-sm text-foreground shadow-md";
                preview.textContent =
                  kind === "stack"
                    ? (stacks.find((entry) => entry.id === id)?.name ?? "Stack")
                    : `Brick ${placements.find((entry) => entry.id === id)?.brickId ?? ""}`;
                container.append(preview);
              },
            }),
        }),
      );
    }

    // 2. Rows use the stock vertical before/combine/after zones. Only the middle
    // resolves a horizontal Placement insertion; it cannot steal a Row's edges.
    for (const element of root.querySelectorAll<HTMLElement>("[data-wall-row]")) {
      const row = rows.find((entry) => entry.id === element.dataset.wallRow);
      if (!row) continue;
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => accepts(source.data) && source.data.kind !== "stack",
          getData: ({ input, source }) => {
            const data = attachInstruction(
              {},
              {
                element,
                input,
                operations: {
                  "reorder-before": "available",
                  combine: "available",
                  "reorder-after": "available",
                },
              },
            );
            const instruction = extractInstruction(data);
            if (instruction?.operation !== "combine") {
              const siblings = rows.filter((entry) => entry.stackId === row.stackId);
              return {
                ...data,
                indicatorElement: element,
                target: {
                  wallId,
                  kind: "stack",
                  stackId: row.stackId,
                  beforeRowId:
                    instruction?.operation === "reorder-before"
                      ? row.id
                      : (siblings[siblings.indexOf(row) + 1]?.id ?? null),
                },
              };
            }
            const cells = Array.from(
              element.querySelectorAll<HTMLElement>("[data-wall-placement]"),
            );
            const cell =
              cells.find((entry) => input.clientX <= entry.getBoundingClientRect().right) ??
              cells.at(-1);
            if (!cell)
              return {
                ...data,
                indicatorElement: element,
                target: { wallId, kind: "row", rowId: row.id, beforePlacementId: null },
              };
            const horizontal = attachInstruction(
              {},
              {
                element: cell,
                input,
                axis: "horizontal",
                operations: { "reorder-before": "available", "reorder-after": "available" },
              },
            );
            const index = row.placements.findIndex(
              (entry) => entry.id === cell.dataset.wallPlacement,
            );
            const beforePlacementId =
              extractInstruction(horizontal)?.operation === "reorder-before"
                ? cell.dataset.wallPlacement
                : (row.placements.slice(index + 1).find((entry) => entry.id !== source.data.id)
                    ?.id ?? null);
            return {
              ...horizontal,
              indicatorElement: cell,
              target: { wallId, kind: "row", rowId: row.id, beforePlacementId },
            };
          },
        }),
      );
    }
    // 3. The innermost eligible container owns background drops. Full Sections
    // stay blocked instead of falling through and silently creating a Section.
    for (const element of root.querySelectorAll<HTMLElement>("[data-wall-stack]")) {
      const stack = stacks.find((entry) => entry.id === element.dataset.wallStack);
      if (!stack) continue;
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => accepts(source.data),
          getData: ({ source, input }) => {
            if (source.data.kind !== "stack")
              return attachInstruction(
                {
                  indicatorElement: element,
                  target: { wallId, kind: "stack", stackId: stack.id, beforeRowId: null },
                },
                { element, input, operations: { combine: "available" } },
              );
            const siblings = stacks.filter((entry) => entry.sectionId === stack.sectionId);
            const allowed =
              source.data.id !== stack.id &&
              (siblings.some((entry) => entry.id === source.data.id) ||
                siblings.length < stackLimit);
            const data = attachInstruction(
              {},
              {
                element,
                input,
                axis: "horizontal",
                operations: {
                  "reorder-before": allowed ? "available" : "blocked",
                  "reorder-after": allowed ? "available" : "blocked",
                },
              },
            );
            return {
              ...data,
              indicatorElement: element,
              target: {
                wallId,
                kind: "section",
                sectionId: stack.sectionId,
                beforeStackId:
                  extractInstruction(data)?.operation === "reorder-before"
                    ? stack.id
                    : (siblings
                        .slice(siblings.indexOf(stack) + 1)
                        .find((entry) => entry.id !== source.data.id)?.id ?? null),
              },
            };
          },
        }),
      );
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-wall-section]")) {
      const section = sections.find((entry) => entry.id === element.dataset.wallSection);
      if (!section) continue;
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => accepts(source.data),
          getData: ({ source, input }) =>
            attachInstruction(
              {
                indicatorElement: element,
                target:
                  source.data.kind === "stack"
                    ? { wallId, kind: "section", sectionId: section.id, beforeStackId: null }
                    : { wallId, kind: "section", sectionId: section.id },
              },
              {
                element,
                input,
                operations: {
                  combine:
                    section.stacks.length < stackLimit ||
                    (source.data.kind === "stack" &&
                      section.stacks.some((stack) => stack.id === source.data.id))
                      ? "available"
                      : "blocked",
                },
              },
            ),
        }),
      );
    }
    disposers.push(
      dropTargetForElements({
        element: root,
        canDrop: ({ source, input }) =>
          accepts(source.data) &&
          (sections.length === 0 || input.clientY >= sectionList.getBoundingClientRect().bottom),
        getData: ({ input }) =>
          attachInstruction(
            {
              indicatorElement: root,
              target: { wallId, kind: "wall", beforeSectionId: null },
            },
            { element: root, input, operations: { combine: "available" } },
          ),
      }),
    );
    function updateDropIndicator(event: ElementDropTargetEventBasePayload) {
      const target = event.location.current.dropTargets[0];
      const instruction = target ? extractInstruction(target.data) : null;
      setIndicator(
        target?.data.indicatorElement instanceof HTMLElement && instruction
          ? { element: target.data.indicatorElement, instruction }
          : null,
      );
    }
    disposers.push(
      monitorForElements({
        canMonitor: ({ source }) => accepts(source.data),
        onDragStart: (event) => {
          root.dataset.dragging = "true";
          updateDropIndicator(event);
        },
        onDrag: updateDropIndicator,
        onDropTargetChange: updateDropIndicator,
        onDrop: ({ source, location }) => {
          delete root.dataset.dragging;
          setIndicator(null);
          const target = location.current.dropTargets[0];
          if (
            !target ||
            !extractInstruction(target.data) ||
            extractInstruction(target.data)?.blocked
          )
            return;
          if (source.data.kind === "stack" && typeof source.data.id === "string") {
            const decoded = Schema.decodeUnknownResult(stackMoveTargetSchema)(target.data.target);
            if (Result.isSuccess(decoded) && onMoveStack(source.data.id, decoded.success) !== false)
              announce("Stack moved in this Wall.");
            return;
          }
          const decoded = Schema.decodeUnknownResult(wallInsertionTargetSchema)(target.data.target);
          if (Result.isFailure(decoded)) return;
          if (source.data.kind === "wall-module" && typeof source.data.moduleId === "string") {
            if (onAddModule?.(source.data.moduleId, decoded.success) !== false)
              announce("Brick added to the Wall.");
          } else if (
            source.data.kind === "placement" &&
            typeof source.data.id === "string" &&
            !(
              decoded.success.kind === "row" && decoded.success.beforePlacementId === source.data.id
            )
          ) {
            if (onMovePlacement(source.data.id, decoded.success) !== false)
              announce("Brick moved in this Wall.");
          }
        },
      }),
    );
    return combine(...disposers, () => {
      delete root.dataset.dragging;
      setIndicator(null);
    });
  }, [wallId, sections, scope, isActive, stackLimit, onAddModule, onMovePlacement, onMoveStack]);

  const finalFocus = () =>
    rootRef.current?.ownerDocument.getElementById(returnFocusId.current ?? "") ??
    rootRef.current?.querySelector<HTMLElement>(
      "[data-placement-grip], [data-stack-grip], button",
    ) ??
    rootRef.current;
  return (
    <div
      ref={rootRef}
      data-wall-editor={wallId}
      tabIndex={-1}
      className="group/wall relative min-h-full min-w-0 w-full outline-none"
      aria-label={`${breakpoint} Wall editor`}
    >
      <div ref={sectionsRef}>
        {sections.map((section) => (
          <WallSection
            key={section.id}
            section={section}
            scope={scope}
            selectedBrickId={selectedBrickId}
            onEditBrick={onEditBrick}
            onRequestMovePlacement={(id, triggerId) => {
              returnFocusId.current = triggerId;
              setMoving({ kind: "placement", id });
            }}
            onRequestMoveStack={(id, triggerId) => {
              returnFocusId.current = triggerId;
              setMoving({ kind: "stack", id });
            }}
            onRequestDelete={(brickId, triggerId) => {
              returnFocusId.current = triggerId;
              setDeletingBrickId(brickId);
            }}
          />
        ))}
      </div>
      {indicator &&
        createPortal(<DropIndicator instruction={indicator.instruction} />, indicator.element)}
      {moving && (
        <WallMoveDialog
          key={`${moving.kind}-${moving.id}`}
          wallId={wallId}
          sections={sections}
          moving={moving}
          stackLimit={stackLimit}
          onMovePlacement={(id, target) => {
            const accepted = onMovePlacement(id, target);
            if (accepted !== false) announce("Brick moved in this Wall.");
            return accepted;
          }}
          onMoveStack={(id, target) => {
            const accepted = onMoveStack(id, target);
            if (accepted !== false) announce("Stack moved in this Wall.");
            return accepted;
          }}
          onClose={() => {
            setMoving(null);
            // Moving can reparent the trigger; resolve its new DOM node after commit.
            requestAnimationFrame(() => finalFocus()?.focus());
          }}
          finalFocus={finalFocus}
        />
      )}
      <Dialog.Root
        open={deletingBrickId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBrickId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/30" />
          <Dialog.Popup
            finalFocus={finalFocus}
            className="fixed left-1/2 top-1/2 z-[101] grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 text-foreground shadow-xl outline-none"
          >
            <Dialog.Title className="text-lg font-medium">Delete Brick?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              This deletes the shared Brick and its Placements at all four breakpoints. Empty Rows,
              Stacks, and Sections remain.
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingBrickId !== null && onDeleteBrick(deletingBrickId) !== false) {
                    setDeletingBrickId(null);
                    announce("Brick deleted at all four breakpoints.");
                  }
                }}
              >
                Delete Brick
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
