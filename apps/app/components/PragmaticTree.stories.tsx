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

// Adapted from Atlassian's current Tree example using list-item hitboxes.
// https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/documentation/examples/tree.vr.ap.tsx
// Sections own Stacks, and Stacks own Items. This stays in Storybook until phase 3.
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
    const [layout, setLayout] = useState<{
      sections: string[];
      stacks: { id: string; sectionId: string }[];
      items: { id: string; stackId: string; isDraft: boolean }[];
    }>(() => {
      const firstStackId = makeId();
      const secondStackId = makeId();
      const thirdStackId = makeId();
      return {
        sections: ["1", "2"],
        stacks: [
          { id: firstStackId, sectionId: "1" },
          { id: secondStackId, sectionId: "1" },
          { id: thirdStackId, sectionId: "2" },
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
    const addSectionRef = useRef<HTMLButtonElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const moveTriggerId = useRef<string | null>(null);
    const [contextId] = useState(() => Symbol("storybook-stacks"));
    const [dragging, setDragging] = useState<{ kind: "item" | "stack"; id: string } | null>(null);
    const [drop, setDrop] = useState<{
      kind: "item" | "stack";
      id: string;
      instruction: Instruction;
    } | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [moving, setMoving] = useState<{ kind: "item" | "stack"; id: string } | null>(null);
    const [section, setSection] = useState("1");
    const [destinationStack, setDestinationStack] = useState("new");
    const [position, setPosition] = useState("0");

    const moveItem = useCallback(
      (move: { itemId: string; sectionId: string; stackId: string | null; index: number }) => {
        const { itemId, sectionId, stackId, index } = move;
        if (
          !items.some((item) => item.id === itemId) ||
          !sections.includes(sectionId) ||
          (stackId !== null && !stacks.some((stack) =>
            stack.id === stackId && stack.sectionId === sectionId,
          ))
        ) return;

        // Allocate once; a background drop and New stack move create ownership atomically.
        const destinationId = stackId ?? makeId();
        setLayout((current) => {
          const item = current.items.find((entry) => entry.id === itemId);
          if (!item) return current;
          const remaining = current.items.filter((entry) => entry.id !== itemId);
          const siblings = remaining.filter((entry) => entry.stackId === destinationId);
          const before = siblings[index];
          const insertion = before ? remaining.indexOf(before) : remaining.length;
          remaining.splice(insertion, 0, { ...item, stackId: destinationId });
          return {
            ...current,
            stacks: stackId === null
              ? [...current.stacks, { id: destinationId, sectionId }]
              : current.stacks,
            items: remaining,
          };
        });
        announce(
          `Moved Item ${itemId} to position ${index + 1} in Stack ${destinationId}, Section ${sectionId}.`,
        );
      },
      [items, sections, stacks],
    );

    const moveStack = useCallback(
      (move: { stackId: string; sectionId: string; index: number }) => {
        const { stackId, sectionId, index } = move;
        if (!stacks.some((stack) => stack.id === stackId) || !sections.includes(sectionId)) return;
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
        announce(`Moved Stack ${stackId} to position ${index + 1} in Section ${sectionId}.`);
      },
      [sections, stacks],
    );

    useEffect(() => cleanup, []);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const disposers: (() => void)[] = [];

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
                      "rounded-sm border bg-background px-3 py-2 text-sm text-foreground shadow-md";
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
                source.data.kind === "item" &&
                typeof source.data.id === "string" &&
                source.data.id !== item.id,
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
                if (source.data.contextId !== contextId || typeof source.data.id !== "string") {
                  return false;
                }
                if (source.data.kind === "stack") return source.data.id !== stack.id;
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
        setDrop(
          instruction && !instruction.blocked && typeof id === "string" &&
          (kind === "item" || kind === "stack")
            ? { kind, id, instruction }
            : null,
        );
        setActiveGroup(typeof target?.data.groupId === "string" ? target.data.groupId : null);
      };

      disposers.push(
        monitorForElements({
          canMonitor: ({ source }) => source.data.contextId === contextId,
          onDragStart: updateTarget,
          onDrag: updateTarget,
          onDropTargetChange: updateTarget,
          onDrop: ({ source, location }) => {
            setDragging(null);
            setDrop(null);
            setActiveGroup(null);
            const sourceId = source.data.id;
            const kind = source.data.kind;
            const target = location.current.dropTargets[0];
            if (
              typeof sourceId !== "string" ||
              (kind !== "item" && kind !== "stack") ||
              !target
            ) return;

            const instruction = extractInstruction(target.data);
            if (instruction) {
              if (
                instruction.blocked ||
                instruction.operation === "combine" ||
                typeof target.data.id !== "string" ||
                target.data.id === sourceId
              ) return;
              const after = instruction.operation === "reorder-after" ? 1 : 0;
              if (kind === "item" && target.data.kind === "item") {
                const targetItem = items.find((item) => item.id === target.data.id);
                const stack = stacks.find((entry) => entry.id === targetItem?.stackId);
                if (!targetItem || !stack) return;
                const siblings = items.filter((item) =>
                  item.stackId === stack.id && item.id !== sourceId,
                );
                moveItem({
                  itemId: sourceId,
                  sectionId: stack.sectionId,
                  stackId: stack.id,
                  index: siblings.findIndex((item) => item.id === targetItem.id) + after,
                });
              } else if (kind === "stack" && target.data.kind === "stack") {
                const targetStack = stacks.find((stack) => stack.id === target.data.id);
                if (!targetStack) return;
                const siblings = stacks.filter((stack) =>
                  stack.sectionId === targetStack.sectionId && stack.id !== sourceId,
                );
                moveStack({
                  stackId: sourceId,
                  sectionId: targetStack.sectionId,
                  index: siblings.findIndex((stack) => stack.id === targetStack.id) + after,
                });
              }
              return;
            }

            if (kind === "item" && typeof target.data.stackId === "string") {
              const stack = stacks.find((entry) => entry.id === target.data.stackId);
              if (!stack) return;
              moveItem({
                itemId: sourceId,
                sectionId: stack.sectionId,
                stackId: stack.id,
                index: items.filter((item) =>
                  item.stackId === stack.id && item.id !== sourceId,
                ).length,
              });
            } else if (typeof target.data.sectionId === "string") {
              const sectionId = target.data.sectionId;
              if (kind === "item") {
                moveItem({ itemId: sourceId, sectionId, stackId: null, index: 0 });
              } else {
                moveStack({
                  stackId: sourceId,
                  sectionId,
                  index: stacks.filter((stack) =>
                    stack.sectionId === sectionId && stack.id !== sourceId,
                  ).length,
                });
              }
            }
          },
        }),
      );
      return combine(...disposers);
    }, [items, stacks, sections, contextId, moveItem, moveStack]);

    const positionCount = moving?.kind === "stack"
      ? stacks.filter((stack) => stack.sectionId === section && stack.id !== moving.id).length + 1
      : items.filter((item) =>
          item.stackId === destinationStack && item.id !== moving?.id,
        ).length + 1;

    return (
      <div style={{ width, maxWidth: "calc(100vw - 32px)" }}>
        <div
          ref={rootRef}
          className="rounded-sm bg-muted/50 pb-3 text-sm"
          role="group"
          aria-label="Draggable sections and stacks"
        >
          <div>
            {sections.map((sectionId, sectionIndex) => {
              const sectionStacks = stacks.filter((stack) => stack.sectionId === sectionId);
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
                          const stackId = makeId();
                          setLayout((current) => ({
                            ...current,
                            sections: current.sections.flatMap((entry) =>
                              entry === sectionId ? [newSectionId, entry] : [entry],
                            ),
                            stacks: [...current.stacks, { id: stackId, sectionId: newSectionId }],
                          }));
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
                      className={`grid ${sectionStacks.length > 1 ? "grid-cols-2" : "grid-cols-1"} items-start gap-2 p-2`}
                      data-section-id={sectionId}
                      role="group"
                      aria-label={`Section ${sectionId}`}
                    >
                      {sectionStacks.length === 0 ? (
                        <div className="rounded-sm border border-dashed border-border p-6 text-center text-muted-foreground">
                          Empty section
                        </div>
                      ) : sectionStacks.map((stack) => {
                        const stackItems = items.filter((item) => item.stackId === stack.id);
                        return (
                          <GroupDropIndicator
                            key={stack.id}
                            isActive={activeGroup === `stack-${stack.id}`}
                          >
                            <div
                              data-layout-stack={stack.id}
                              className="relative min-w-0 rounded-sm bg-background"
                              style={{ opacity: dragging?.kind === "stack" && dragging.id === stack.id ? 0.4 : 1 }}
                              role="group"
                              aria-label={`Stack ${stack.id}`}
                            >
                              {stackItems.map((item, itemIndex) => (
                                <div
                                  key={item.id}
                                  data-item-id={item.id}
                                  className="relative rounded-sm hover:bg-black/5"
                                >
                                  <Button
                                    id={`tree-row-${item.id}`}
                                    data-tree-row={item.id}
                                    type="button"
                                    variant="ghost"
                                    className="relative w-full justify-start gap-0 rounded-sm px-2 pr-10 font-normal"
                                    style={{ height: rowHeight, opacity: dragging?.kind === "item" && dragging.id === item.id ? 0.4 : 1 }}
                                  >
                                    <span className="min-w-0 flex-1 truncate text-left">
                                      Item {item.id}
                                    </span>
                                    {item.isDraft && <code className="text-xs text-muted-foreground">Draft</code>}
                                    {drop?.kind === "item" && drop.id === item.id && (
                                      <DropIndicator instruction={drop.instruction} />
                                    )}
                                  </Button>
                                  <Button
                                    id={`tree-move-${item.id}`}
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-1/2 right-1 size-7 -translate-y-1/2 rounded-sm text-muted-foreground"
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
                              ))}
                              <div className="flex items-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="min-w-0 flex-1 justify-start gap-0 rounded-sm px-2 font-normal text-muted-foreground"
                                  style={{ height: rowHeight }}
                                  aria-label={`Add item to Stack ${stack.id}`}
                                  onClick={() => {
                                    const id = String(nextItemId.current++);
                                    setLayout((current) => ({
                                      ...current,
                                      items: [
                                        ...current.items,
                                        { id, stackId: stack.id, isDraft: false },
                                      ],
                                    }));
                                    announce(`Added Item ${id} to Stack ${stack.id}.`);
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
                                <Button
                                  id={`stack-move-${stack.id}`}
                                  data-stack-grip
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="mr-1 size-7 shrink-0 cursor-grab rounded-sm text-muted-foreground active:cursor-grabbing"
                                  aria-label={`Move Stack ${stack.id}`}
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
                              {drop?.kind === "stack" && drop.id === stack.id && (
                                <DropIndicator instruction={drop.instruction} />
                              )}
                            </div>
                          </GroupDropIndicator>
                        );
                      })}
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
                const stackId = makeId();
                setLayout((current) => ({
                  ...current,
                  sections: [...current.sections, sectionId],
                  stacks: [...current.stacks, { id: stackId, sectionId }],
                }));
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
          open={moving !== null}
          onOpenChange={(open) => {
            if (!open) setMoving(null);
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (moveTriggerId.current) document.getElementById(moveTriggerId.current)?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Move {moving?.kind === "stack" ? "Stack" : "Item"} {moving?.id}</DialogTitle>
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
                    <SelectTrigger id="tree-stack" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stacks.filter((stack) => stack.sectionId === section).map((stack) => (
                        <SelectItem key={stack.id} value={stack.id}>
                          Stack {stack.id}
                        </SelectItem>
                      ))}
                      <SelectItem value="new">New stack</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              <Label htmlFor="tree-position">Position</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger id="tree-position" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: positionCount }, (_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMoving(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!moving) return;
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
} satisfies Meta<{ width: number; rowHeight: number }>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
