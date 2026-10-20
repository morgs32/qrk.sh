import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item/attach-instruction";
import { extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item/extract-instruction";
import type { Instruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { announce, cleanup } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import { DropIndicator as BoxDropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/list-item";
import { GroupDropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/group";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
  type ElementDropTargetEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Ellipsis, GripVertical, Plus } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { makeId } from "../lib/makeId";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";

function InsertionSeparator(props: {
  variant: "item" | "section";
  label: string;
  active: boolean;
  disabled: boolean;
  dropActive?: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const { variant, label, active, disabled, dropActive, onClick, onPointerEnter, onPointerLeave } = props;
  const decoration = (
    <>
      <span
        className="pointer-events-none flex shrink-0 items-center justify-center rounded-none border-solid border-current"
        style={{
          width: "calc(var(--ds-border-width-selected, 2px) * 8)",
          height: "calc(var(--ds-border-width-selected, 2px) * 8)",
          borderWidth: variant === "item" ? "var(--ds-border-width-selected, 2px)" : 0,
        }}
      >
        <Plus
          className="size-1"
          style={{
            width: "calc(var(--ds-border-width-selected, 2px) * 5)",
            height: "calc(var(--ds-border-width-selected, 2px) * 5)",
          }}
          aria-hidden="true"
        />
      </span>
      {variant === "item" && (
        <Separator
          asChild
          className="pointer-events-none min-h-0 min-w-0 flex-1 bg-current"
          style={{
            height: "var(--ds-border-width-selected, 2px)",
            boxShadow: "0 1px 3px rgb(24 24 27 / 0.18)",
          }}
        >
          <span />
        </Separator>
      )}
    </>
  );

  // Keep the shared boundary, using Pragmatic Drag and Drop's default drag appearance.
  if (dropActive) {
    return (
      <div aria-hidden="true" className="pointer-events-none relative h-4 w-full">
        <div className="absolute inset-x-0 top-1/2">
          <BoxDropIndicator edge="top" />
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      data-active={active}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        marginLeft: variant === "item" ? "calc(var(--ds-border-width-selected, 2px) * -4)" : undefined,
        width: variant === "item" ? "calc(100% + var(--ds-border-width-selected, 2px) * 4)" : undefined,
        color: variant === "item" ? "var(--ds-border-selected, #1868DB)" : undefined,
        opacity: disabled ? 0 : undefined,
        pointerEvents: disabled ? "none" : undefined,
        transition: disabled ? "none" : undefined,
      }}
      className={`pointer-events-auto h-4 w-full gap-0 rounded-none p-0 opacity-0 transition-[color,opacity,background-color,border-color] duration-[140ms] data-[active=true]:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100 ${variant === "section" ? "border border-zinc-200 bg-zinc-100 text-zinc-400 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-500 focus-visible:text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-400 dark:focus-visible:text-zinc-400" : "hover:bg-transparent dark:hover:bg-transparent"}`}
    >
      {decoration}
    </Button>
  );
}

// Adapted from Atlassian's current Tree example using list-item hitboxes.
// https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/documentation/examples/tree.vr.ap.tsx
// Sections own Stacks, and Stacks own Items. This stays in Storybook until phase 3.
const meta = {
  title: "App/Studio/Pragmatic Tree",
  parameters: { layout: "centered" },
  args: { width: 480, rowHeight: 40, maxStacksPerSection: 4 },
  argTypes: {
    width: { control: { type: "range", min: 240, max: 640, step: 20 } },
    rowHeight: { control: { type: "range", min: 28, max: 56, step: 4 } },
    maxStacksPerSection: { control: { type: "range", min: 1, max: 6, step: 1 } },
  },
  render: function Render(props: { width: number; rowHeight: number; maxStacksPerSection: number }) {
    const { width, rowHeight, maxStacksPerSection } = props;
    const stackLimit = Math.max(1, Math.floor(maxStacksPerSection));
    const [layout, setLayout] = useState<{
      sections: string[];
      stacks: { id: string; name: string; sectionId: string }[];
      items: { id: string; stackId: string; isDraft: boolean }[];
    }>(() => {
      const firstStackId = makeId();
      const secondStackId = makeId();
      const thirdStackId = makeId();
      return {
        sections: ["1", "2"],
        stacks: [
          { id: firstStackId, name: "Stack 1", sectionId: "1" },
          { id: secondStackId, name: "Stack 2", sectionId: "1" },
          { id: thirdStackId, name: "Stack 3", sectionId: "2" },
        ],
        items: [
          { id: "1", stackId: firstStackId, isDraft: false },
          { id: "2", stackId: firstStackId, isDraft: false },
          { id: "3", stackId: firstStackId, isDraft: false },
          { id: "4", stackId: secondStackId, isDraft: false },
          { id: "5", stackId: secondStackId, isDraft: false },
          { id: "6", stackId: thirdStackId, isDraft: false },
        ],
      };
    });
    const { sections, stacks, items } = layout;
    const nextItemId = useRef(7);
    const nextSectionId = useRef(3);
    const nextStackNumber = useRef(4);
    const rootRef = useRef<HTMLDivElement>(null);
    const moveTriggerId = useRef<string | null>(null);
    const [contextId] = useState(() => Symbol("storybook-stacks"));
    const [dragging, setDragging] = useState<{ kind: "item" | "stack" | "palette-item"; id: string } | null>(null);
    const [drop, setDrop] = useState<
      | { kind: "item" | "stack"; id: string; instruction: Instruction }
      | { kind: "item-insertion"; stackId: string; beforeItemId: string | null }
      | null
    >(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [moving, setMoving] = useState<{ kind: "item" | "stack"; id: string } | null>(null);
    const [section, setSection] = useState("1");
    const [destinationStack, setDestinationStack] = useState("new");
    const [position, setPosition] = useState("0");
    const [pointerInsertion, setPointerInsertion] = useState<
      | { kind: "item"; stackId: string; beforeItemId: string | null }
      | { kind: "section"; beforeSectionId: string | null }
      | null
    >(null);
    const insertionTimer = useRef<number | null>(null);

    const clearInsertion = useCallback(() => {
      if (insertionTimer.current !== null) {
        window.clearTimeout(insertionTimer.current);
        insertionTimer.current = null;
      }
      setPointerInsertion(null);
    }, []);

    function activateInsertion(target:
      | { kind: "item"; stackId: string; beforeItemId: string | null }
      | { kind: "section"; beforeSectionId: string | null }
    ) {
      if (dragging !== null) return;
      if (insertionTimer.current !== null) {
        window.clearTimeout(insertionTimer.current);
        insertionTimer.current = null;
      }
      setPointerInsertion(target);
    }

    function dismissInsertion() {
      if (insertionTimer.current !== null) window.clearTimeout(insertionTimer.current);
      insertionTimer.current = window.setTimeout(() => {
        insertionTimer.current = null;
        setPointerInsertion(null);
      }, 150);
    }

    const insertAt = useCallback((target:
      | { kind: "item"; stackId: string; beforeItemId: string | null }
      | { kind: "section"; beforeSectionId: string | null }
    ) => {
      if (target.kind === "item") {
        const stack = stacks.find((entry) => entry.id === target.stackId);
        const index = target.beforeItemId === null
          ? items.length
          : items.findIndex((item) => item.id === target.beforeItemId && item.stackId === target.stackId);
        if (!stack || index < 0) return;

        // Resolve the live anchor before allocating identity, once per activation.
        const id = String(nextItemId.current++);
        const nextItems = [...items];
        nextItems.splice(index, 0, { id, stackId: stack.id, isDraft: false });
        setLayout({ ...layout, items: nextItems });
        announce(target.beforeItemId === null
          ? `Added Item ${id} to ${stack.name}.`
          : `Added Item ${id} before Item ${target.beforeItemId} in ${stack.name}.`);
        return;
      }

      const index = target.beforeSectionId === null
        ? sections.length
        : sections.indexOf(target.beforeSectionId);
      if (index < 0) return;
      const sectionId = String(nextSectionId.current++);
      const stack = { id: makeId(), name: `Stack ${nextStackNumber.current++}`, sectionId };
      const nextSections = [...sections];
      nextSections.splice(index, 0, sectionId);
      setLayout({ ...layout, sections: nextSections, stacks: [...stacks, stack] });
      announce(target.beforeSectionId === null
        ? `Added Section ${sectionId}.`
        : `Added Section ${sectionId} before Section ${target.beforeSectionId}.`);
    }, [layout, items, stacks, sections]);

    useEffect(() => {
      window.addEventListener("blur", clearInsertion);
      return () => {
        window.removeEventListener("blur", clearInsertion);
        if (insertionTimer.current !== null) window.clearTimeout(insertionTimer.current);
      };
    }, [clearInsertion]);

    useEffect(() => {
      if (pointerInsertion?.kind === "item") {
        if (
          !stacks.some((stack) => stack.id === pointerInsertion.stackId) ||
          (pointerInsertion.beforeItemId !== null && !items.some((item) =>
            item.id === pointerInsertion.beforeItemId && item.stackId === pointerInsertion.stackId,
          ))
        ) clearInsertion();
      } else if (
        pointerInsertion?.kind === "section" &&
        pointerInsertion.beforeSectionId !== null &&
        !sections.includes(pointerInsertion.beforeSectionId)
      ) clearInsertion();
    }, [pointerInsertion, items, stacks, sections, clearInsertion]);

    const moveItem = useCallback(
      (move: { itemId: string; sectionId: string; stackId: string | null; index: number }) => {
        const { itemId, sectionId, stackId, index } = move;
        if (
          !items.some((item) => item.id === itemId) ||
          !sections.includes(sectionId) ||
          (stackId === null && stacks.filter((stack) => stack.sectionId === sectionId).length >= stackLimit)
        ) return;

        // Allocate once; a background drop and New stack move create ownership atomically.
        const targetStack = stackId === null
          ? { id: makeId(), name: `Stack ${nextStackNumber.current++}`, sectionId }
          : stacks.find((stack) => stack.id === stackId && stack.sectionId === sectionId);
        if (!targetStack) return;
        setLayout((current) => {
          const item = current.items.find((entry) => entry.id === itemId);
          if (!item) return current;
          const remaining = current.items.filter((entry) => entry.id !== itemId);
          const siblings = remaining.filter((entry) => entry.stackId === targetStack.id);
          const before = siblings[index];
          const insertion = before ? remaining.indexOf(before) : remaining.length;
          remaining.splice(insertion, 0, { ...item, stackId: targetStack.id });
          return {
            ...current,
            stacks: stackId === null
              ? [...current.stacks, targetStack]
              : current.stacks,
            items: remaining,
          };
        });
        announce(
          `Moved Item ${itemId} to position ${index + 1} in ${targetStack.name}, Section ${sectionId}.`,
        );
      },
      [items, sections, stacks, stackLimit],
    );

    const moveStack = useCallback(
      (move: { stackId: string; sectionId: string; index: number }) => {
        const { stackId, sectionId, index } = move;
        const sourceStack = stacks.find((stack) => stack.id === stackId);
        if (
          !sourceStack || !sections.includes(sectionId) ||
          (sourceStack.sectionId !== sectionId && stacks.filter((stack) => stack.sectionId === sectionId).length >= stackLimit)
        ) return;
        setLayout((current) => {
          const stack = current.stacks.find((entry) => entry.id === stackId);
          if (!stack) return current;
          const remaining = current.stacks.filter((entry) => entry.id !== stackId);
          const siblings = remaining.filter((entry) => entry.sectionId === sectionId);
          const before = siblings[index];
          const insertion = before ? remaining.indexOf(before) : remaining.length;
          remaining.splice(insertion, 0, { ...stack, sectionId });
          return { ...current, stacks: remaining };
        });
        announce(`Moved ${sourceStack.name} to position ${index + 1} in Section ${sectionId}.`);
      },
      [sections, stacks, stackLimit],
    );

    useEffect(() => cleanup, []);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const disposers: (() => void)[] = [];

      const paletteItem = root.querySelector<HTMLButtonElement>("[data-palette-item]");
      if (paletteItem) {
        disposers.push(draggable({
          element: paletteItem,
          getInitialData: () => ({ kind: "palette-item", contextId }),
          onGenerateDragPreview: ({ nativeSetDragImage }) => {
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
              render: ({ container }) => {
                const preview = document.createElement("div");
                preview.className = "rounded-none border bg-background px-3 py-2 text-sm text-foreground shadow-md";
                preview.textContent = "New Item";
                container.append(preview);
              },
            });
          },
          onDragStart: () => setDragging({ kind: "palette-item", id: "mock-item" }),
        }));
      }

      // The same anchored boundary accepts a new template or an existing Item.
      for (const element of root.querySelectorAll<HTMLDivElement>("[data-item-insertion]")) {
        const stackId = element.dataset.stackId;
        const beforeItemId = element.dataset.beforeItemId || null;
        if (!stackId) continue;
        disposers.push(dropTargetForElements({
          element,
          canDrop: ({ source }) =>
            source.data.contextId === contextId &&
            (source.data.kind === "palette-item" ||
              (source.data.kind === "item" && typeof source.data.id === "string")),
          getData: () => ({ kind: "item-insertion", stackId, beforeItemId }),
        }));
      }

      for (const element of root.querySelectorAll<HTMLButtonElement>("[data-tree-row]")) {
        const item = items.find((entry) => entry.id === element.dataset.treeRow);
        if (!item) continue;
        disposers.push(
          combine(
            draggable({
              element,
              getInitialData: () => ({ kind: "item", id: item.id, contextId }),
              onGenerateDragPreview: ({ nativeSetDragImage }) => {
                setCustomNativeDragPreview({
                  nativeSetDragImage,
                  getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
                  render: ({ container }) => {
                    const preview = document.createElement("div");
                    preview.className =
                      "rounded-none border bg-background px-3 py-2 text-sm text-foreground shadow-md";
                    preview.textContent = `Item ${item.id}`;
                    container.append(preview);
                  },
                });
              },
              onDragStart: () => setDragging({ kind: "item", id: item.id }),
            }),
            dropTargetForElements({
              element,
              canDrop: ({ source }) =>
                source.data.contextId === contextId &&
                (source.data.kind === "palette-item" ||
                  (source.data.kind === "item" &&
                    typeof source.data.id === "string" && source.data.id !== item.id)),
              getData: ({ input, element }) =>
                attachInstruction(
                  { kind: "item", id: item.id },
                  {
                    input,
                    element,
                    operations: {
                      "reorder-before": "available",
                      "reorder-after": "available",
                    },
                  },
                ),
            }),
          ),
        );
      }

      for (const element of root.querySelectorAll<HTMLDivElement>("[data-layout-stack]")) {
        const stack = stacks.find((entry) => entry.id === element.dataset.layoutStack);
        const grip = element.querySelector<HTMLButtonElement>("[data-stack-grip]");
        if (!stack || !grip) continue;
        disposers.push(
          combine(
            draggable({
              element,
              dragHandle: grip,
              getInitialData: () => ({ kind: "stack", id: stack.id, contextId }),
              onDragStart: () => setDragging({ kind: "stack", id: stack.id }),
            }),
            dropTargetForElements({
              element,
              canDrop: ({ source, input }) => {
                if (source.data.contextId !== contextId) return false;
                if (source.data.kind === "palette-item") return true;
                if (typeof source.data.id !== "string") return false;
                if (source.data.kind === "stack") {
                  return source.data.id !== stack.id && (
                    stacks.some((entry) => entry.id === source.data.id && entry.sectionId === stack.sectionId) ||
                    stacks.filter((entry) => entry.sectionId === stack.sectionId).length < stackLimit
                  );
                }
                if (source.data.kind !== "item") return false;
                const hovered = element.ownerDocument.elementFromPoint(input.clientX, input.clientY);
                // A rejected self-row drop must not fall through to append in its Stack.
                return hovered?.closest("[data-item-id]")?.getAttribute("data-item-id") !== source.data.id;
              },
              getData: ({ source, input, element }) =>
                source.data.kind === "stack"
                  ? attachInstruction(
                      { kind: "stack", id: stack.id },
                      {
                        input,
                        element,
                        axis: "horizontal",
                        operations: {
                          "reorder-before": "available",
                          "reorder-after": "available",
                        },
                      },
                    )
                  : { groupId: `stack-${stack.id}`, stackId: stack.id },
            }),
          ),
        );
      }

      for (const element of root.querySelectorAll<HTMLDivElement>("[data-section-id]")) {
        const sectionId = element.dataset.sectionId;
        if (!sectionId) continue;
        disposers.push(
          dropTargetForElements({
            element,
            canDrop: ({ source, input }) => {
              if (
                source.data.contextId !== contextId ||
                typeof source.data.id !== "string" ||
                (source.data.kind !== "item" && source.data.kind !== "stack")
              ) return false;
              if (
                stacks.filter((stack) => stack.sectionId === sectionId).length >= stackLimit &&
                !(source.data.kind === "stack" && stacks.some((stack) => stack.id === source.data.id && stack.sectionId === sectionId))
              ) return false;
              const hovered = element.ownerDocument.elementFromPoint(input.clientX, input.clientY);
              return Boolean(hovered && !hovered.closest("[data-layout-stack], [data-add-section]"));
            },
            getData: () => ({ groupId: `section-${sectionId}`, sectionId }),
          }),
        );
      }

      const updateTarget = ({ location }: Pick<ElementDropTargetEventBasePayload, "location">) => {
        const target = location.current.dropTargets[0];
        const instruction = target && extractInstruction(target.data);
        const kind = target?.data.kind;
        const id = target?.data.id;
        const stackId = target?.data.stackId;
        const beforeItemId = target?.data.beforeItemId;
        setDrop(
          kind === "item-insertion" && typeof stackId === "string" &&
          (beforeItemId === null || typeof beforeItemId === "string")
            ? { kind, stackId, beforeItemId }
            : instruction && !instruction.blocked && typeof id === "string" &&
              (kind === "item" || kind === "stack")
              ? { kind, id, instruction }
              : null,
        );
        setActiveGroup(typeof target?.data.groupId === "string" ? target.data.groupId : null);
      };

      disposers.push(
        monitorForElements({
          canMonitor: ({ source }) => source.data.contextId === contextId,
          onDragStart: (event) => {
            clearInsertion();
            updateTarget(event);
          },
          onDrag: updateTarget,
          onDropTargetChange: updateTarget,
          onDrop: ({ source, location }) => {
            setDragging(null);
            setDrop(null);
            setActiveGroup(null);
            const sourceId = source.data.id;
            const kind = source.data.kind;
            const target = location.current.dropTargets[0];
            if (!target) return;

            const instruction = extractInstruction(target.data);
            if (kind === "item" || kind === "palette-item") {
              if (kind === "item" && typeof sourceId !== "string") return;
              let insertion: { stackId: string; beforeItemId: string | null } | null = null;
              if (
                target.data.kind === "item-insertion" &&
                typeof target.data.stackId === "string" &&
                (target.data.beforeItemId === null || typeof target.data.beforeItemId === "string")
              ) {
                insertion = { stackId: target.data.stackId, beforeItemId: target.data.beforeItemId };
              } else if (instruction && target.data.kind === "item") {
                if (instruction.blocked || instruction.operation === "combine" || target.data.id === sourceId) return;
                const targetItem = items.find((item) => item.id === target.data.id);
                if (!targetItem) return;
                const siblings = items.filter((item) => item.stackId === targetItem.stackId);
                const nextItem = siblings[siblings.indexOf(targetItem) + 1];
                insertion = {
                  stackId: targetItem.stackId,
                  beforeItemId: instruction.operation === "reorder-before" ? targetItem.id : nextItem?.id ?? null,
                };
              } else if (typeof target.data.stackId === "string") {
                insertion = { stackId: target.data.stackId, beforeItemId: null };
              }

              if (insertion) {
                const { stackId, beforeItemId } = insertion;
                if (kind === "palette-item") {
                  // Allocate an Item only after a successful drop, through the click action.
                  insertAt({ kind: "item", ...insertion });
                  return;
                }
                if (typeof sourceId !== "string" || beforeItemId === sourceId) return;
                const stack = stacks.find((entry) => entry.id === stackId);
                if (!stack) return;
                const siblings = items.filter((item) => item.stackId === stack.id && item.id !== sourceId);
                const index = beforeItemId === null
                  ? siblings.length
                  : siblings.findIndex((item) => item.id === beforeItemId);
                if (index < 0) return;
                moveItem({
                  itemId: sourceId,
                  sectionId: stack.sectionId,
                  stackId: stack.id,
                  index,
                });
              } else if (kind === "item" && typeof sourceId === "string" && typeof target.data.sectionId === "string") {
                moveItem({ itemId: sourceId, sectionId: target.data.sectionId, stackId: null, index: 0 });
              }
              return;
            }

            if (kind !== "stack" || typeof sourceId !== "string") return;
            if (instruction) {
              if (
                instruction.blocked || instruction.operation === "combine" ||
                target.data.kind !== "stack" || typeof target.data.id !== "string" || target.data.id === sourceId
              ) return;
              const targetStack = stacks.find((stack) => stack.id === target.data.id);
              if (!targetStack) return;
              const siblings = stacks.filter((stack) => stack.sectionId === targetStack.sectionId && stack.id !== sourceId);
              moveStack({
                stackId: sourceId,
                sectionId: targetStack.sectionId,
                index: siblings.findIndex((stack) => stack.id === targetStack.id) + (instruction.operation === "reorder-after" ? 1 : 0),
              });
            } else if (typeof target.data.sectionId === "string") {
              const sectionId = target.data.sectionId;
              moveStack({
                stackId: sourceId,
                sectionId,
                index: stacks.filter((stack) => stack.sectionId === sectionId && stack.id !== sourceId).length,
              });
            }
          },
        }),
      );
      return combine(...disposers);
    }, [items, stacks, sections, stackLimit, contextId, moveItem, moveStack, insertAt, clearInsertion]);

    const positionCount = moving?.kind === "stack"
      ? stacks.filter((stack) => stack.sectionId === section && stack.id !== moving.id).length + 1
      : items.filter((item) =>
          item.stackId === destinationStack && item.id !== moving?.id,
        ).length + 1;
    const destinationSectionFull = stacks.filter((stack) => stack.sectionId === section).length >= stackLimit;
    const moveAtCapacity = moving?.kind === "stack"
      ? stacks.find((stack) => stack.id === moving.id)?.sectionId !== section && destinationSectionFull
      : destinationStack === "new" && destinationSectionFull;

    let dragInsertion: { stackId: string; beforeItemId: string | null } | null = null;
    if (dragging?.kind === "item" || dragging?.kind === "palette-item") {
      if (drop?.kind === "item-insertion") {
        dragInsertion = { stackId: drop.stackId, beforeItemId: drop.beforeItemId };
      } else if (drop?.kind === "item" && !drop.instruction.blocked) {
        const target = items.find((item) => item.id === drop.id);
        if (target && drop.instruction.operation !== "combine") {
          const stackItems = items.filter((item) => item.stackId === target.stackId);
          const nextItem = stackItems[stackItems.indexOf(target) + 1];
          dragInsertion = {
            stackId: target.stackId,
            beforeItemId: drop.instruction.operation === "reorder-before" ? target.id : nextItem?.id ?? null,
          };
        }
      } else {
        const stack = stacks.find((entry) => activeGroup === `stack-${entry.id}`);
        if (stack) dragInsertion = { stackId: stack.id, beforeItemId: null };
      }
    }

    return (
      <div
        ref={rootRef}
        className="flex flex-wrap items-start justify-center gap-6 text-sm [&_*]:rounded-none! [&_*::before]:rounded-none! [&_*::after]:rounded-none!"
        style={{ maxWidth: "calc(100vw - 32px)" }}
      >
        <aside className="w-40 shrink-0 rounded-none border border-border bg-muted/30 p-3" aria-label="Mock Item palette">
          <p className="mb-2 font-medium">Items</p>
          <Button
            data-palette-item
            type="button"
            variant="outline"
            className="w-full cursor-grab justify-start rounded-none active:cursor-grabbing"
            aria-label="Drag a new Item into a Stack"
            aria-describedby="palette-item-hint"
            style={{ opacity: dragging?.kind === "palette-item" ? 0.4 : 1 }}
          >
            <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
            New item
          </Button>
          <p id="palette-item-hint" className="mt-2 text-xs text-muted-foreground">Drag onto a separator to add an Item.</p>
        </aside>
        <div
          className="pb-3"
          style={{ width, maxWidth: "calc(100vw - 32px)" }}
          role="group"
          aria-label="Draggable sections and stacks"
        >
          <div className="divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {sections.map((sectionId) => {
              const sectionStacks = stacks.filter((stack) => stack.sectionId === sectionId);
              return (
                <Fragment key={sectionId}>
                  <GroupDropIndicator isActive={activeGroup === `section-${sectionId}`}>
                    <div
                      className="relative grid items-stretch divide-x divide-zinc-200 dark:divide-zinc-800"
                      style={{ gridTemplateColumns: `repeat(${Math.max(1, sectionStacks.length)}, minmax(0, 1fr))` }}
                      data-section-id={sectionId}
                      role="group"
                      aria-label={`Section ${sectionId}`}
                    >
                      {sectionStacks.length === 0 ? (
                        <div className="rounded-none p-6 text-center text-muted-foreground">
                          Empty section
                        </div>
                      ) : sectionStacks.map((stack) => {
                        const stackItems = items.filter((item) => item.stackId === stack.id);
                        return (
                          <div key={stack.id} className="relative min-w-0 [&>div]:h-full">
                          <GroupDropIndicator
                            isActive={activeGroup === `stack-${stack.id}`}
                          >
                            <div
                              data-layout-stack={stack.id}
                              className="group/stack relative h-full min-w-0 rounded-none bg-muted/50 hover:z-30 focus-within:z-30"
                              style={{ minHeight: rowHeight, opacity: dragging?.kind === "stack" && dragging.id === stack.id ? 0.4 : 1 }}
                              role="group"
                              aria-label={stack.name}
                            >
                              <div
                                className="pointer-events-none absolute inset-x-0 bottom-full z-30 flex items-center gap-2 border border-zinc-200 bg-muted pl-2 pr-1 font-medium text-muted-foreground opacity-0 transition-opacity duration-[140ms] group-hover/stack:pointer-events-auto group-hover/stack:opacity-100 group-focus-within/stack:pointer-events-auto group-focus-within/stack:opacity-100 motion-reduce:transition-none dark:border-zinc-800"
                                style={{
                                  height: rowHeight,
                                  opacity: dragging !== null ? 0 : undefined,
                                  pointerEvents: dragging !== null ? "none" : undefined,
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate">{stack.name}</span>
                                <Button
                                  id={`stack-move-${stack.id}`}
                                  data-stack-grip
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="relative z-20 size-7 shrink-0 cursor-grab rounded-none text-muted-foreground active:cursor-grabbing"
                                  aria-label={`Move ${stack.name}`}
                                  aria-haspopup="dialog"
                                  onClick={(event) => {
                                    moveTriggerId.current = event.currentTarget.id;
                                    setMoving({ kind: "stack", id: stack.id });
                                    setSection(sectionId);
                                    setPosition(String(sectionStacks.indexOf(stack)));
                                  }}
                                >
                                  <GripVertical className="size-4" aria-hidden="true" />
                                </Button>
                              </div>
                              {stackItems.map((item, itemIndex) => (
                                <Fragment key={item.id}>
                                  <div className="pointer-events-none relative z-10 h-0">
                                    <div
                                      data-item-insertion
                                      data-stack-id={stack.id}
                                      data-before-item-id={item.id}
                                      className={`${dragging !== null && dragging.kind !== "stack" ? "pointer-events-auto" : "pointer-events-none"} absolute inset-x-0 top-0 flex h-4 -translate-y-1/2`}
                                    >
                                      <InsertionSeparator
                                        variant="item"
                                        label={`Add item before Item ${item.id} in ${stack.name}`}
                                        active={pointerInsertion?.kind === "item" && pointerInsertion.stackId === stack.id && pointerInsertion.beforeItemId === item.id}
                                        disabled={dragging !== null}
                                        dropActive={dragInsertion?.stackId === stack.id && dragInsertion.beforeItemId === item.id}
                                        onClick={() => insertAt({ kind: "item", stackId: stack.id, beforeItemId: item.id })}
                                        onPointerEnter={() => activateInsertion({ kind: "item", stackId: stack.id, beforeItemId: item.id })}
                                        onPointerLeave={dismissInsertion}
                                      />
                                    </div>
                                  </div>
                                <div
                                  data-item-id={item.id}
                                  className="relative rounded-none bg-background"
                                >
                                  <Button
                                    id={`tree-row-${item.id}`}
                                    data-tree-row={item.id}
                                    type="button"
                                    variant="ghost"
                                    className="relative w-full justify-start gap-0 rounded-none px-2 pr-10 font-normal"
                                    style={{ height: rowHeight, opacity: dragging?.kind === "item" && dragging.id === item.id ? 0.4 : 1 }}
                                  >
                                    <span className="min-w-0 flex-1 truncate text-left">
                                      Item {item.id}
                                    </span>
                                    {item.isDraft && <code className="text-xs text-muted-foreground">Draft</code>}
                                  </Button>
                                  <Button
                                    id={`tree-move-${item.id}`}
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1/2 right-1 z-20 size-7 -translate-y-1/2 rounded-none text-muted-foreground"
                                    aria-label={`Move Item ${item.id}`}
                                    aria-haspopup="dialog"
                                    onClick={(event) => {
                                      moveTriggerId.current = event.currentTarget.id;
                                      setMoving({ kind: "item", id: item.id });
                                      setSection(sectionId);
                                      setDestinationStack(stack.id);
                                      setPosition(String(itemIndex));
                                    }}
                                  >
                                    <Ellipsis className="size-4" aria-hidden="true" />
                                  </Button>
                                </div>
                                </Fragment>
                              ))}
                              <div className="pointer-events-none relative z-10 h-0">
                                <div
                                  data-item-insertion
                                  data-stack-id={stack.id}
                                  data-before-item-id=""
                                  className={`${dragging !== null && dragging.kind !== "stack" ? "pointer-events-auto" : "pointer-events-none"} absolute inset-x-0 top-0 flex h-4 -translate-y-1/2`}
                                >
                                  <InsertionSeparator
                                    variant="item"
                                    label={`Add item to ${stack.name}`}
                                    active={pointerInsertion?.kind === "item" && pointerInsertion.stackId === stack.id && pointerInsertion.beforeItemId === null}
                                    disabled={dragging !== null}
                                    dropActive={dragInsertion?.stackId === stack.id && dragInsertion.beforeItemId === null}
                                    onClick={() => insertAt({ kind: "item", stackId: stack.id, beforeItemId: null })}
                                    onPointerEnter={() => activateInsertion({ kind: "item", stackId: stack.id, beforeItemId: null })}
                                    onPointerLeave={dismissInsertion}
                                  />
                                </div>
                              </div>
                              {drop?.kind === "stack" && drop.id === stack.id && (
                                <DropIndicator instruction={drop.instruction} />
                              )}
                            </div>
                          </GroupDropIndicator>
                          </div>
                        );
                      })}
                    </div>
                  </GroupDropIndicator>
                </Fragment>
              );
            })}
          </div>
          <div data-add-section className="pointer-events-none relative z-10 mt-2 flex h-4 w-full">
            <InsertionSeparator
              variant="section"
              label="Add section"
              active={pointerInsertion?.kind === "section" && pointerInsertion.beforeSectionId === null}
              disabled={dragging !== null}
              onClick={() => insertAt({ kind: "section", beforeSectionId: null })}
              onPointerEnter={() => activateInsertion({ kind: "section", beforeSectionId: null })}
              onPointerLeave={dismissInsertion}
            />
          </div>
        </div>
        <Dialog
          open={moving !== null}
          onOpenChange={(open) => {
            if (!open) setMoving(null);
          }}
        >
          <DialogContent
            className="rounded-none [&_*]:rounded-none!"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (moveTriggerId.current) document.getElementById(moveTriggerId.current)?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Move {moving?.kind === "stack"
                  ? stacks.find((stack) => stack.id === moving.id)?.name
                  : `Item ${moving?.id ?? ""}`}
              </DialogTitle>
              <DialogDescription>
                {moving?.kind === "stack"
                  ? "Choose a section and position."
                  : "Choose a section, stack, and position."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="tree-section">Section</Label>
              <Select
                value={section}
                onValueChange={(value) => {
                  setSection(value);
                  setDestinationStack("new");
                  setPosition("0");
                }}
              >
                <SelectTrigger id="tree-section" className="w-full rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none [&_*]:rounded-none!">
                  {sections.map((sectionId) => (
                    <SelectItem
                      key={sectionId}
                      value={sectionId}
                      disabled={moving?.kind === "stack" &&
                        stacks.find((stack) => stack.id === moving.id)?.sectionId !== sectionId &&
                        stacks.filter((stack) => stack.sectionId === sectionId).length >= stackLimit}
                    >
                      Section {sectionId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {moving?.kind === "item" && (
                <>
                  <Label htmlFor="tree-stack">Stack</Label>
                  <Select
                    value={destinationStack}
                    onValueChange={(value) => {
                      setDestinationStack(value);
                      setPosition("0");
                    }}
                  >
                    <SelectTrigger id="tree-stack" className="w-full rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none [&_*]:rounded-none!">
                      {stacks.filter((stack) => stack.sectionId === section).map((stack) => (
                        <SelectItem key={stack.id} value={stack.id}>
                          {stack.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="new" disabled={destinationSectionFull}>New stack</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              <Label htmlFor="tree-position">Position</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger id="tree-position" className="w-full rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none [&_*]:rounded-none!">
                  {Array.from({ length: positionCount }, (_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setMoving(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-none"
                disabled={!moving || moveAtCapacity}
                onClick={() => {
                  if (!moving || moveAtCapacity) return;
                  if (moving.kind === "stack") {
                    moveStack({ stackId: moving.id, sectionId: section, index: Number(position) });
                  } else {
                    moveItem({
                      itemId: moving.id,
                      sectionId: section,
                      stackId: destinationStack === "new" ? null : destinationStack,
                      index: Number(position),
                    });
                  }
                  setMoving(null);
                }}
              >
                Move
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
} satisfies Meta<{ width: number; rowHeight: number; maxStacksPerSection: number }>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
