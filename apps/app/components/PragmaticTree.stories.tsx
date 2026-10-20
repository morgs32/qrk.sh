import { attachInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item/attach-instruction";
import { extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item/extract-instruction";
import type { Instruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { announce, cleanup } from "@atlaskit/pragmatic-drag-and-drop-live-region";
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
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

// Adapted from Atlassian's current Tree example (list-item hitboxes, not tree-item).
// https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/documentation/examples/tree.vr.ap.tsx
// This entire interaction stays in Storybook until the Studio integration phase.
const meta = {
  title: "App/Studio/Pragmatic Tree",
  parameters: { layout: "centered" },
  args: { width: 480, rowHeight: 40 },
  argTypes: {
    width: { control: { type: "range", min: 240, max: 640, step: 20 } },
    rowHeight: { control: { type: "range", min: 28, max: 56, step: 4 } },
  },
  render: function Render(props: { width: number; rowHeight: number }) {
    const { width, rowHeight } = props;
    const [sections, setSections] = useState(["1", "2"]);
    const [items, setItems] = useState<
      {
        id: string;
        parentId: string | null;
        sectionId: string | null;
        isDraft: boolean;
      }[]
    >([
      { id: "1", parentId: null, sectionId: "1", isDraft: false },
      { id: "2", parentId: "1", sectionId: null, isDraft: false },
      { id: "3", parentId: "1", sectionId: null, isDraft: false },
      { id: "4", parentId: null, sectionId: "1", isDraft: false },
      { id: "5", parentId: "4", sectionId: null, isDraft: false },
      { id: "6", parentId: null, sectionId: "2", isDraft: false },
    ]);
    const nextItemId = useRef(7);
    const nextSectionId = useRef(3);
    const addSectionRef = useRef<HTMLButtonElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const moveTriggerId = useRef<string | null>(null);
    const [contextId] = useState(() => Symbol("storybook-tree"));
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [drop, setDrop] = useState<{ id: string; instruction: Instruction } | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [section, setSection] = useState("1");
    const [parent, setParent] = useState("root");
    const [position, setPosition] = useState("0");

    const isWithin = useCallback(
      (itemId: string, ancestorId: string): boolean => {
        let current = items.find((item) => item.id === itemId);
        while (current) {
          if (current.id === ancestorId) return true;
          current = items.find((item) => item.id === current?.parentId);
        }
        return false;
      },
      [items],
    );

    // Both movement paths enforce two levels: root groups and childless items.
    const moveItem = useCallback(
      (move: { itemId: string; parentId: string | null; sectionId: string; index: number }) => {
        const { itemId, parentId, sectionId, index } = move;
        const item = items.find((entry) => entry.id === itemId);
        if (
          !item ||
          !sections.includes(sectionId) ||
          (parentId !== null && isWithin(parentId, itemId))
        ) return;
        if (parentId !== null) {
          const parentItem = items.find((entry) => entry.id === parentId);
          if (
            !parentItem ||
            parentItem.parentId !== null ||
            parentItem.sectionId !== sectionId ||
            parentItem.isDraft
          ) return;
          if (items.some((entry) => entry.parentId === itemId)) return;
        }

        const remaining = items.filter((entry) => entry.id !== itemId);
        const siblings = remaining.filter(
          (entry) => entry.parentId === parentId && (parentId !== null || entry.sectionId === sectionId),
        );
        const before = siblings[index];
        const insertion = before ? remaining.indexOf(before) : remaining.length;
        remaining.splice(insertion, 0, {
          ...item,
          parentId,
          sectionId: parentId === null ? sectionId : null,
        });
        setItems(remaining);
        announce(
          `Moved Item ${itemId} to position ${index + 1} in ${parentId ? `Item ${parentId}` : `Section ${sectionId}`}.`,
        );
      },
      [items, sections, isWithin],
    );

    useEffect(() => cleanup, []);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const disposers: (() => void)[] = [];

      for (const element of root.querySelectorAll<HTMLButtonElement>("[data-tree-row]")) {
        const item = items.find((entry) => entry.id === element.dataset.treeRow);
        if (!item) continue;
        const onChange = ({ self }: ElementDropTargetEventBasePayload) => {
          const instruction = extractInstruction(self.data);
          setDrop(instruction ? { id: item.id, instruction } : null);
        };

        disposers.push(
          combine(
            draggable({
              element,
              getInitialData: () => ({ id: item.id, contextId }),
              onGenerateDragPreview: ({ nativeSetDragImage }) => {
                setCustomNativeDragPreview({
                  nativeSetDragImage,
                  getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
                  render: ({ container }) => {
                    const preview = document.createElement("div");
                    preview.className =
                      "rounded-sm border bg-background px-3 py-2 text-sm text-foreground shadow-md";
                    preview.textContent = `Item ${item.id}`;
                    container.append(preview);
                  },
                });
              },
              onDragStart: () => setDraggingId(item.id),
            }),
            dropTargetForElements({
              element,
              canDrop: ({ source }) =>
                source.data.contextId === contextId &&
                typeof source.data.id === "string" &&
                !isWithin(item.id, source.data.id) &&
                (item.parentId === null || !items.some((entry) => entry.parentId === source.data.id)),
              getData: ({ input, element, source }) =>
                attachInstruction(
                  { id: item.id },
                  {
                    input,
                    element,
                    operations: item.isDraft
                      ? { combine: "blocked" }
                      : {
                          combine:
                            item.parentId === null &&
                            !items.some((entry) => entry.parentId === source.data.id)
                              ? "available"
                              : "not-available",
                          "reorder-before": "available",
                          "reorder-after":
                            items.some((child) => child.parentId === item.id)
                              ? "not-available"
                              : "available",
                        },
                  },
                ),
              onDragEnter: onChange,
              onDrag: onChange,
              onDragLeave: () => setDrop(null),
            }),
          ),
        );
      }

      for (const element of [root, ...root.querySelectorAll<HTMLDivElement>("[data-tree-group]")]) {
        const id = element.dataset.treeGroup;
        const sectionId = element.dataset.sectionId;
        if (!id) continue;
        const onChange = ({ location, self }: ElementDropTargetEventBasePayload) => {
          const innermost = location.current.dropTargets.find((target) => target.data.groupId);
          if (innermost?.element === self.element) setActiveGroup(id);
        };
        disposers.push(
          dropTargetForElements({
            element,
            canDrop: ({ source, input }) => {
              const sourceId = source.data.id;
              if (source.data.contextId !== contextId || typeof sourceId !== "string") return false;
              if (sectionId) {
                // Section drops append at root only over the background, not over a stack's controls.
                const hovered = element.ownerDocument.elementFromPoint(
                  input.clientX,
                  input.clientY,
                );
                return !hovered?.closest("[data-tree-stack], [data-add-section]");
              }
              return (
                items.some((entry) => entry.id === id && entry.parentId === null) &&
                !items.some((entry) => entry.parentId === sourceId) &&
                !isWithin(id, sourceId)
              );
            },
            getData: () => sectionId ? { groupId: id, sectionId } : { groupId: id },
            onDragEnter: onChange,
            onDropTargetChange: onChange,
            onDragLeave: () => setActiveGroup(null),
          }),
        );
      }

      disposers.push(
        monitorForElements({
          canMonitor: ({ source }) => source.data.contextId === contextId,
          onDrop: ({ source, location }) => {
            setDraggingId(null);
            setDrop(null);
            setActiveGroup(null);
            const itemId = source.data.id;
            if (typeof itemId !== "string") return;
            const target = location.current.dropTargets.find((entry) =>
              extractInstruction(entry.data),
            );
            if (!target) {
              const sectionTarget = location.current.dropTargets.find(
                (entry) => typeof entry.data.sectionId === "string",
              );
              const sectionId = sectionTarget?.data.sectionId;
              if (typeof sectionId !== "string") return;
              const index = items.filter(
                (entry) => entry.parentId === null && entry.sectionId === sectionId && entry.id !== itemId,
              ).length;
              moveItem({ itemId, parentId: null, sectionId, index });
              return;
            }
            if (typeof target.data.id !== "string") return;
            const instruction = extractInstruction(target.data);
            if (!instruction || instruction.blocked) return;
            const targetItem = items.find((entry) => entry.id === target.data.id);
            if (!targetItem) return;
            const parentId =
              instruction.operation === "combine" ? targetItem.id : targetItem.parentId;
            const sectionId = targetItem.sectionId ??
              items.find((entry) => entry.id === targetItem.parentId)?.sectionId;
            if (!sectionId) return;
            const siblings = items.filter(
              (entry) =>
                entry.parentId === parentId && entry.id !== itemId &&
                (parentId !== null || entry.sectionId === sectionId),
            );
            const index =
              instruction.operation === "combine"
                ? 0
                : siblings.findIndex((entry) => entry.id === targetItem.id) +
                  (instruction.operation === "reorder-after" ? 1 : 0);
            moveItem({ itemId, parentId, sectionId, index });
          },
        }),
      );
      return combine(...disposers);
    }, [items, contextId, isWithin, moveItem]);

    function renderItems(parentId: string | null, sectionId: string): ReactNode {
      return items
        .filter(
          (item) => item.parentId === parentId && (parentId !== null || item.sectionId === sectionId),
        )
        .map((item) => {
          const hasChildren = items.some((child) => child.parentId === item.id);
          return (
            <div
              key={item.id}
              data-tree-stack={item.parentId === null ? item.id : undefined}
              className={
                parentId === null
                  ? "min-w-0 rounded-sm bg-background"
                  : undefined
              }
            >
              <div className="relative rounded-sm hover:bg-black/5">
                <Button
                  id={`tree-row-${item.id}`}
                  data-tree-row={item.id}
                  type="button"
                  variant="ghost"
                  className="relative w-full justify-start gap-0 rounded-sm px-2 pr-10 font-normal"
                  style={{ height: rowHeight, opacity: draggingId === item.id ? 0.4 : 1 }}
                >
                  <span className="min-w-0 flex-1 truncate text-left">Item {item.id}</span>
                  {item.isDraft && <code className="text-xs text-muted-foreground">Draft</code>}
                  {drop?.id === item.id && <DropIndicator instruction={drop.instruction} />}
                </Button>
                <Button
                  id={`tree-move-${item.id}`}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-sm text-muted-foreground"
                  aria-label={`Move Item ${item.id}`}
                  onClick={(event) => {
                    moveTriggerId.current = event.currentTarget.id;
                    setMovingId(item.id);
                    setSection(sectionId);
                    setParent(item.parentId ?? "root");
                    setPosition("0");
                  }}
                >
                  <Ellipsis className="size-4" />
                </Button>
              </div>
              {hasChildren && (
                <div>
                  <GroupDropIndicator isActive={activeGroup === item.id}>
                    <div id={`tree-group-${item.id}`} data-tree-group={item.id}>
                      {renderItems(item.id, sectionId)}
                    </div>
                  </GroupDropIndicator>
                </div>
              )}
              {item.parentId === null && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start gap-0 rounded-sm px-2 font-normal text-muted-foreground"
                  style={{ height: rowHeight }}
                  aria-label={`Add item to Item ${item.id}`}
                  onClick={() => {
                    const id = String(nextItemId.current++);
                    setItems((current) => [
                      ...current,
                      { id, parentId: item.id, sectionId: null, isDraft: false },
                    ]);
                    announce(`Added Item ${id} to Item ${item.id}.`);
                  }}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center"
                    aria-hidden="true"
                  >
                    <Plus className="size-4" />
                  </span>
                  Add item
                  <GripVertical className="ml-auto size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          );
        });
    }

    const siblings = items.filter(
      (item) =>
        item.parentId === (parent === "root" ? null : parent) && item.id !== movingId &&
        (parent !== "root" || item.sectionId === section),
    );

    return (
      <div style={{ width, maxWidth: "calc(100vw - 32px)" }}>
        <div
          ref={rootRef}
          className="rounded-sm bg-muted/50 pb-3 text-sm"
          role="group"
          aria-label="Draggable tree"
        >
          <div>
            {sections.map((sectionId, sectionIndex) => {
              const stackCount = items.filter(
                (item) => item.parentId === null && item.sectionId === sectionId,
              ).length;
              return (
                <Fragment key={sectionId}>
                  {sectionIndex > 0 && (
                    <div data-add-section className="relative z-10 h-1 w-full">
                      <Button
                        type="button"
                        variant="ghost"
                        className="group absolute inset-x-2 top-1/2 h-6 -translate-y-1/2 gap-1 rounded-sm p-0 text-muted-foreground hover:bg-transparent hover:text-violet-600 focus-visible:text-violet-600 dark:hover:bg-transparent dark:hover:text-violet-400 dark:focus-visible:text-violet-400"
                        aria-label={`Add section before Section ${sectionId}`}
                        onClick={() => {
                          const newSectionId = String(nextSectionId.current++);
                          const id = String(nextItemId.current++);
                          setSections((current) => current.flatMap((entry) =>
                            entry === sectionId ? [newSectionId, entry] : [entry],
                          ));
                          setItems((current) => [
                            ...current,
                            { id, parentId: null, sectionId: newSectionId, isDraft: false },
                          ]);
                          announce(`Added Section ${newSectionId} before Section ${sectionId}.`);
                        }}
                      >
                        <Separator
                          asChild
                          className="pointer-events-none flex-1 transition-colors group-hover:bg-current group-focus-visible:bg-current"
                        >
                          <span />
                        </Separator>
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-transparent transition-colors group-hover:border-current group-focus-visible:border-current">
                          <Plus className="size-3" aria-hidden="true" />
                        </span>
                        <Separator
                          asChild
                          className="pointer-events-none flex-1 transition-colors group-hover:bg-current group-focus-visible:bg-current"
                        >
                          <span />
                        </Separator>
                      </Button>
                    </div>
                  )}
                  <GroupDropIndicator isActive={activeGroup === `section-${sectionId}`}>
                    <div
                      className={`grid ${stackCount > 1 ? "grid-cols-2" : "grid-cols-1"} items-start gap-2 p-2`}
                      data-tree-group={`section-${sectionId}`}
                      data-section-id={sectionId}
                      role="group"
                      aria-label={`Section ${sectionId}`}
                    >
                      {stackCount === 0 ? (
                        <div className="rounded-sm border border-dashed border-border p-6 text-center text-muted-foreground">
                          Empty section
                        </div>
                      ) : renderItems(null, sectionId)}
                    </div>
                  </GroupDropIndicator>
                </Fragment>
              );
            })}
          </div>
          <div data-add-section className="relative z-10 h-1 w-full">
            <Button
              ref={addSectionRef}
              type="button"
              variant="ghost"
              className="group absolute inset-x-2 top-1/2 h-6 -translate-y-1/2 gap-1 rounded-sm p-0 text-muted-foreground hover:bg-transparent hover:text-violet-600 focus-visible:text-violet-600 dark:hover:bg-transparent dark:hover:text-violet-400 dark:focus-visible:text-violet-400"
              aria-label="Add section"
              onClick={() => {
                const sectionId = String(nextSectionId.current++);
                const id = String(nextItemId.current++);
                setSections((current) => [...current, sectionId]);
                setItems((current) => [
                  ...current,
                  { id, parentId: null, sectionId, isDraft: false },
                ]);
                announce(`Added Section ${sectionId}.`);
                requestAnimationFrame(() => addSectionRef.current?.focus());
              }}
            >
              <Separator
                asChild
                className="pointer-events-none flex-1 transition-colors group-hover:bg-current group-focus-visible:bg-current"
              >
                <span />
              </Separator>
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-transparent transition-colors group-hover:border-current group-focus-visible:border-current">
                <Plus className="size-3" aria-hidden="true" />
              </span>
              <Separator
                asChild
                className="pointer-events-none flex-1 transition-colors group-hover:bg-current group-focus-visible:bg-current"
              >
                <span />
              </Separator>
            </Button>
          </div>
        </div>
        <Dialog
          open={movingId !== null}
          onOpenChange={(open) => {
            if (!open) setMovingId(null);
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (moveTriggerId.current) document.getElementById(moveTriggerId.current)?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Move Item {movingId}</DialogTitle>
              <DialogDescription>Choose a section, parent, and position.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="tree-section">Section</Label>
              <Select
                value={section}
                onValueChange={(value) => {
                  setSection(value);
                  setParent("root");
                  setPosition("0");
                }}
              >
                <SelectTrigger id="tree-section" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((sectionId) => (
                    <SelectItem key={sectionId} value={sectionId}>
                      Section {sectionId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="tree-parent">Parent</Label>
              <Select
                value={parent}
                onValueChange={(value) => {
                  setParent(value);
                  setPosition("0");
                }}
              >
                <SelectTrigger id="tree-parent" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">No parent</SelectItem>
                  {items
                    .filter(
                      (item) =>
                        item.parentId === null &&
                        item.sectionId === section &&
                        !item.isDraft &&
                        movingId !== null &&
                        !isWithin(item.id, movingId) &&
                        !items.some((entry) => entry.parentId === movingId),
                    )
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        Item {item.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Label htmlFor="tree-position">Position</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger id="tree-position" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: siblings.length + 1 }, (_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovingId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (movingId === null) return;
                  moveItem({
                    itemId: movingId,
                    parentId: parent === "root" ? null : parent,
                    sectionId: section,
                    index: Number(position),
                  });
                  setMovingId(null);
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
} satisfies Meta<{ width: number; rowHeight: number }>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
