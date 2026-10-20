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
import { ChevronDown, ChevronRight, Circle, Ellipsis, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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
    const [items, setItems] = useState<
      {
        id: string;
        parentId: string | null;
        isOpen: boolean;
        isDraft: boolean;
      }[]
    >([
      { id: "1", parentId: null, isOpen: true, isDraft: false },
      { id: "1.1", parentId: "1", isOpen: false, isDraft: false },
      { id: "1.2", parentId: "1", isOpen: false, isDraft: false },
      { id: "2", parentId: null, isOpen: true, isDraft: false },
      { id: "2.1", parentId: "2", isOpen: false, isDraft: false },
    ]);
    const nextItemId = useRef(3);
    const rootRef = useRef<HTMLDivElement>(null);
    const moveTriggerId = useRef<string | null>(null);
    const [contextId] = useState(() => Symbol("storybook-tree"));
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [drop, setDrop] = useState<{ id: string; instruction: Instruction } | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
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
      (move: { itemId: string; parentId: string | null; index: number }) => {
        const { itemId, parentId, index } = move;
        const item = items.find((entry) => entry.id === itemId);
        if (!item || (parentId !== null && isWithin(parentId, itemId))) return;
        if (parentId !== null) {
          const parentItem = items.find((entry) => entry.id === parentId);
          if (!parentItem || parentItem.parentId !== null || parentItem.isDraft) return;
          if (items.some((entry) => entry.parentId === itemId)) return;
        }

        const remaining = items.filter((entry) => entry.id !== itemId);
        const siblings = remaining.filter((entry) => entry.parentId === parentId);
        const before = siblings[index];
        const insertion = before ? remaining.indexOf(before) : remaining.length;
        remaining.splice(insertion, 0, { ...item, parentId });
        setItems(
          remaining.map((entry) =>
            parentId !== null && isWithin(parentId, entry.id) ? { ...entry, isOpen: true } : entry,
          ),
        );
        announce(
          `Moved Item ${itemId} to position ${index + 1} in ${parentId ? `Item ${parentId}` : "the root"}.`,
        );
      },
      [items, isWithin],
    );

    useEffect(() => cleanup, []);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const disposers: (() => void)[] = [];

      for (const element of root.querySelectorAll<HTMLButtonElement>("[data-tree-row]")) {
        const item = items.find((entry) => entry.id === element.dataset.treeRow);
        if (!item) continue;
        let expandTimer: ReturnType<typeof setTimeout> | undefined;
        const cancelExpand = () => {
          clearTimeout(expandTimer);
          expandTimer = undefined;
        };
        const onChange = ({ self }: ElementDropTargetEventBasePayload) => {
          const instruction = extractInstruction(self.data);
          setDrop(instruction ? { id: item.id, instruction } : null);
          if (
            instruction?.operation === "combine" &&
            !instruction.blocked &&
            !item.isOpen &&
            items.some((child) => child.parentId === item.id)
          ) {
            if (expandTimer === undefined) {
              expandTimer = setTimeout(() => {
                setItems((current) =>
                  current.map((entry) =>
                    entry.id === item.id ? { ...entry, isOpen: true } : entry,
                  ),
                );
              }, 500);
            }
          } else cancelExpand();
        };

        disposers.push(
          combine(
            cancelExpand,
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
                            item.isOpen && items.some((child) => child.parentId === item.id)
                              ? "not-available"
                              : "available",
                        },
                  },
                ),
              onDragEnter: onChange,
              onDrag: onChange,
              onDragLeave: () => {
                cancelExpand();
                setDrop(null);
              },
              onDrop: cancelExpand,
            }),
          ),
        );
      }

      for (const element of [root, ...root.querySelectorAll<HTMLDivElement>("[data-tree-group]")]) {
        const id = element.dataset.treeGroup;
        if (!id) continue;
        const onChange = ({ location, self }: ElementDropTargetEventBasePayload) => {
          const innermost = location.current.dropTargets.find((target) => target.data.groupId);
          if (innermost?.element === self.element) setActiveGroup(id);
        };
        disposers.push(
          dropTargetForElements({
            element,
            canDrop: ({ source }) =>
              source.data.contextId === contextId &&
              typeof source.data.id === "string" &&
              (id === "root" ||
                (items.some((entry) => entry.id === id && entry.parentId === null) &&
                  !items.some((entry) => entry.parentId === source.data.id) &&
                  !isWithin(id, source.data.id))),
            getData: () => ({ groupId: id }),
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
            const target = location.current.dropTargets.find((entry) =>
              extractInstruction(entry.data),
            );
            if (!target || typeof source.data.id !== "string" || typeof target.data.id !== "string")
              return;
            const instruction = extractInstruction(target.data);
            if (!instruction || instruction.blocked) return;
            const targetItem = items.find((entry) => entry.id === target.data.id);
            if (!targetItem) return;
            const parentId =
              instruction.operation === "combine" ? targetItem.id : targetItem.parentId;
            const siblings = items.filter(
              (entry) => entry.parentId === parentId && entry.id !== source.data.id,
            );
            const index =
              instruction.operation === "combine"
                ? 0
                : siblings.findIndex((entry) => entry.id === targetItem.id) +
                  (instruction.operation === "reorder-after" ? 1 : 0);
            moveItem({ itemId: source.data.id, parentId, index });
          },
        }),
      );
      return combine(...disposers);
    }, [items, contextId, draggingId, isWithin, moveItem]);

    function renderItems(parentId: string | null): ReactNode {
      return items
        .filter((item) => item.parentId === parentId)
        .map((item) => {
          const hasChildren = items.some((child) => child.parentId === item.id);
          const isOpen = item.isOpen && draggingId !== item.id;
          return (
            <div
              key={item.id}
              className={
                parentId === null
                  ? "min-w-0 rounded-sm border border-border bg-background"
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
                  aria-expanded={hasChildren ? isOpen : undefined}
                  aria-controls={hasChildren ? `tree-group-${item.id}` : undefined}
                  onClick={() =>
                    setItems((current) =>
                      current.map((entry) =>
                        entry.id === item.id ? { ...entry, isOpen: !entry.isOpen } : entry,
                      ),
                    )
                  }
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center"
                    aria-hidden="true"
                  >
                    {hasChildren ? (
                      isOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )
                    ) : (
                      <Circle className="size-1 fill-current" />
                    )}
                  </span>
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
                    setParent(item.parentId ?? "root");
                    setPosition("0");
                  }}
                >
                  <Ellipsis className="size-4" />
                </Button>
              </div>
              {hasChildren && isOpen && (
                <div>
                  <GroupDropIndicator isActive={activeGroup === item.id}>
                    <div id={`tree-group-${item.id}`} data-tree-group={item.id}>
                      {renderItems(item.id)}
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
                      ...current.map((entry) =>
                        entry.id === item.id ? { ...entry, isOpen: true } : entry,
                      ),
                      { id, parentId: item.id, isOpen: false, isDraft: false },
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
                </Button>
              )}
            </div>
          );
        });
    }

    const siblings = items.filter(
      (item) => item.parentId === (parent === "root" ? null : parent) && item.id !== movingId,
    );

    return (
      <div style={{ width, maxWidth: "calc(100vw - 32px)" }}>
        <GroupDropIndicator isActive={activeGroup === "root"}>
          <div
            ref={rootRef}
            className="grid grid-cols-2 items-start gap-2 rounded-sm bg-muted/50 p-2 text-sm"
            data-tree-group="root"
            role="group"
            aria-label="Draggable tree"
          >
            {renderItems(null)}
          </div>
        </GroupDropIndicator>
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
              <DialogDescription>Choose a parent and a position in the tree.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
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
