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
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { InsertionSeparator } from "./InsertionSeparator";
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
  onAdd: (target: typeof wallInsertionTargetSchema.Type) => void;
  onAddSection?: (beforeSectionId: string | null) => boolean | void;
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
    onAdd,
    onAddSection,
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

    // 2. Stable insertion anchors support horizontal cells, vertical Rows, and containers.
    for (const element of root.querySelectorAll<HTMLElement>("[data-wall-insertion]")) {
      const target = Schema.decodeUnknownResult(wallInsertionTargetSchema)(
        JSON.parse(element.dataset.wallInsertion ?? "null"),
      );
      if (Result.isFailure(target)) continue;
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) =>
            accepts(source.data) &&
            (source.data.kind !== "stack" || target.success.kind === "wall"),
          getData: () => ({ kind: "wall-insertion", target: target.success }),
          onDragEnter: () => {
            element.dataset.dropActive = "true";
          },
          onDragLeave: () => {
            delete element.dataset.dropActive;
          },
          onDrop: () => {
            delete element.dataset.dropActive;
          },
        }),
      );
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-wall-row]")) {
      const row = rows.find((entry) => entry.id === element.dataset.wallRow);
      if (!row) continue;
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => accepts(source.data) && source.data.kind !== "stack",
          getData: ({ input }) => {
            let beforePlacementId: string | null = null;
            for (const cell of element.querySelectorAll<HTMLElement>("[data-wall-placement]")) {
              const bounds = cell.getBoundingClientRect();
              if (input.clientX < bounds.left + bounds.width / 2) {
                beforePlacementId = cell.dataset.wallPlacement ?? null;
                break;
              }
            }
            return {
              kind: "wall-insertion",
              target: { wallId, kind: "row", rowId: row.id, beforePlacementId },
            };
          },
        }),
      );
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-wall-stack]")) {
      const stack = stacks.find((entry) => entry.id === element.dataset.wallStack);
      if (!stack) continue;
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source, input }) => {
            if (!accepts(source.data)) return false;
            if (source.data.kind === "stack")
              return (
                source.data.id !== stack.id &&
                (stacks.find((entry) => entry.id === source.data.id)?.sectionId ===
                  stack.sectionId ||
                  stacks.filter((entry) => entry.sectionId === stack.sectionId).length < stackLimit)
              );
            return (
              source.data.kind !== "placement" ||
              root.ownerDocument
                .elementFromPoint(input.clientX, input.clientY)
                ?.closest("[data-wall-placement]")
                ?.getAttribute("data-wall-placement") !== source.data.id
            );
          },
          getData: ({ source, input }) => {
            if (source.data.kind !== "stack")
              return {
                kind: "wall-insertion",
                target: { wallId, kind: "stack", stackId: stack.id, beforeRowId: null },
              };
            const bounds = element.getBoundingClientRect();
            const siblings = stacks.filter(
              (entry) => entry.sectionId === stack.sectionId && entry.id !== source.data.id,
            );
            const beforeStackId =
              input.clientX < bounds.left + bounds.width / 2
                ? stack.id
                : (siblings[siblings.findIndex((entry) => entry.id === stack.id) + 1]?.id ?? null);
            return {
              kind: "stack-insertion",
              target: { wallId, kind: "section", sectionId: stack.sectionId, beforeStackId },
            };
          },
          onDragEnter: () => {
            element.dataset.dropActive = "true";
          },
          onDragLeave: () => {
            delete element.dataset.dropActive;
          },
          onDrop: () => {
            delete element.dataset.dropActive;
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
          canDrop: ({ source, input }) =>
            accepts(source.data) &&
            (section.stacks.length < stackLimit ||
              (source.data.kind === "stack" &&
                section.stacks.some((stack) => stack.id === source.data.id))) &&
            !root.ownerDocument
              .elementFromPoint(input.clientX, input.clientY)
              ?.closest("[data-wall-stack]"),
          getData: ({ source }) =>
            source.data.kind === "stack"
              ? {
                  kind: "stack-insertion",
                  target: { wallId, kind: "section", sectionId: section.id, beforeStackId: null },
                }
              : {
                  kind: "wall-insertion",
                  target: { wallId, kind: "section", sectionId: section.id },
                },
          onDragEnter: () => {
            element.dataset.dropActive = "true";
          },
          onDragLeave: () => {
            delete element.dataset.dropActive;
          },
          onDrop: () => {
            delete element.dataset.dropActive;
          },
        }),
      );
    }

    // 3. The active preview canvas owns Section boundaries, including full Sections.
    disposers.push(
      dropTargetForElements({
        element: root,
        canDrop: ({ source, input }) => {
          if (!accepts(source.data)) return false;
          const bounds = sectionList.getBoundingClientRect();
          return (
            sections.length === 0 ||
            input.clientY < bounds.top + 8 ||
            input.clientY > bounds.bottom - 8 ||
            Array.from(sectionList.querySelectorAll<HTMLElement>("[data-wall-section]")).some(
              (section) => Math.abs(input.clientY - section.getBoundingClientRect().top) <= 8,
            )
          );
        },
        getData: ({ input }) => {
          let beforeSectionId: string | null = null;
          for (const element of sectionList.querySelectorAll<HTMLElement>("[data-wall-section]")) {
            if (input.clientY < element.getBoundingClientRect().top + 8) {
              beforeSectionId = element.dataset.wallSection ?? null;
              break;
            }
          }
          return { kind: "wall-boundary", target: { wallId, kind: "wall", beforeSectionId } };
        },
      }),
    );
    function updateDropIndicator(event: ElementDropTargetEventBasePayload) {
      for (const element of root.querySelectorAll<HTMLElement>(
        "[data-drop-active], [data-drop-side]",
      )) {
        delete element.dataset.dropActive;
        delete element.dataset.dropSide;
      }
      const target =
        event.location.current.dropTargets.find((entry) => entry.data.kind === "wall-boundary") ??
        event.location.current.dropTargets[0];
      if (!target) return;
      const insertion = Schema.decodeUnknownResult(wallInsertionTargetSchema)(target.data.target);
      if (
        (event.source.data.kind !== "stack" && Result.isSuccess(insertion)) ||
        target.data.kind === "wall-boundary"
      ) {
        const anchor = JSON.stringify(target.data.target);
        for (const element of root.querySelectorAll<HTMLElement>("[data-wall-insertion]"))
          if (element.dataset.wallInsertion === anchor) element.dataset.dropActive = "true";
      } else {
        const destination = Schema.decodeUnknownResult(stackMoveTargetSchema)(target.data.target);
        if (Result.isFailure(destination) || destination.success.kind !== "section") return;
        const { sectionId, beforeStackId } = destination.success;
        const section = sections.find((entry) => entry.id === sectionId);
        const targetStackId = beforeStackId ?? section?.stacks.at(-1)?.id;
        for (const element of root.querySelectorAll<HTMLElement>("[data-wall-stack]"))
          if (element.dataset.wallStack === targetStackId)
            element.dataset.dropSide = beforeStackId === null ? "right" : "left";
      }
    }
    disposers.push(
      monitorForElements({
        canMonitor: ({ source }) => accepts(source.data),
        onDragStart: updateDropIndicator,
        onDrag: updateDropIndicator,
        onDropTargetChange: updateDropIndicator,
        onDrop: ({ source, location }) => {
          for (const element of root.querySelectorAll<HTMLElement>(
            "[data-drop-active], [data-drop-side]",
          )) {
            delete element.dataset.dropActive;
            delete element.dataset.dropSide;
          }
          const target =
            location.current.dropTargets.find((entry) => entry.data.kind === "wall-boundary") ??
            location.current.dropTargets[0];
          if (!target) return;
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
    return combine(...disposers);
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
      className="relative min-h-full min-w-0 w-full p-3 outline-none"
      aria-label={`${breakpoint} Wall editor`}
    >
      <div ref={sectionsRef}>
        {sections.map((section) => (
          <Fragment key={section.id}>
            <InsertionSeparator
              label={`Insert Brick in a new Section before ${section.id}`}
              target={{ wallId, kind: "wall", beforeSectionId: section.id }}
              onAdd={onAdd}
            />
            <WallSection
              section={section}
              wallId={wallId}
              scope={scope}
              stackLimit={stackLimit}
              selectedBrickId={selectedBrickId}
              onAdd={onAdd}
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
          </Fragment>
        ))}
      </div>
      <InsertionSeparator
        label="Insert Brick in a new Section at end"
        target={{ wallId, kind: "wall", beforeSectionId: null }}
        onAdd={onAdd}
      />
      {onAddSection && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2 h-7 w-full rounded-none border border-dashed border-zinc-200 text-xs text-muted-foreground"
          onClick={() => {
            if (onAddSection(null) !== false) announce("Section added with an empty Stack.");
          }}
        >
          + Add Section
        </Button>
      )}
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
