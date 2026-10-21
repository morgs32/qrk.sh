"use client";

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
import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/list-item";
import { Button } from "@/components/ui/button";
import { WallSection } from "@qrk.sh/library/WallSection";
import {
  stackMoveTargetSchema,
  wallInsertionTargetSchema,
} from "@qrk.sh/library/wallInsertionTargetSchema";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";
import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { isNonEmptySpec } from "@json-render/core";
import { modulesHash } from "@qrk.sh/library/modulesHash";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { BrickWrapper } from "@qrk.sh/library/BrickWrapper";
import { BrickCardStyleContext } from "@qrk.sh/library/BrickCardStyleContext";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { placementV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV1";
import { stackV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/stack/StackV1";
import { pageV3 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { UserUI } from "@/zerospin/UserUI";

/** Session-backed wall editor shared by the connected app and mock-session stories. */
export function WallEditor(props: { breakpoint: "sm" | "md" | "lg" | "xl" }) {
  const { breakpoint } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const params = useParams({ from: "/$username/site/$siteId/page/$pageId" });
  const pageId = Schema.decodeUnknownSync(makeModelIdSchema(pageV3))(params.pageId);
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const navigate = useNavigate();
  const session = UserUI.useSession();
  const { activeBreakpoint } = useWallViewport();
  const isActive = breakpoint === activeBreakpoint;
  const { data: wall } = useLiveQuery({
    session,
    key: { pageId, breakpoint },
    query: (db, key) =>
      db.query.wall.findFirst({
        where: { pageId: { eq: key.pageId }, breakpoint: { eq: key.breakpoint } },
        with: {
          sections: {
            with: {
              stacks: { with: { rows: { with: { placements: { with: { brick: true } } } } } },
            },
          },
        },
      }),
  });
  const wallId = wall?.id;
  const { brickId: selectedBrickId } = useParams({ strict: false });
  let insertionTarget: typeof wallInsertionTargetSchema.Type | null = null;
  if (search.insertion !== undefined) {
    try {
      insertionTarget = Schema.decodeUnknownSync(wallInsertionTargetSchema)(
        JSON.parse(search.insertion),
      );
    } catch {
      // Invalid route input stays a refusal; it must never become an append target.
    }
  }
  const targetWallId = insertionTarget?.wallId;
  const insertionValue = search.insertion;
  useEffect(() => {
    if (!isActive) return;
    if (insertionValue !== undefined && (targetWallId === undefined || targetWallId !== wallId)) {
      void navigate({ to: ".", replace: true, search: {}, resetScroll: false });
    }
  }, [isActive, wallId, insertionValue, targetWallId, navigate]);

  function onEditBrick(brickId: string) {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
      params: { ...params, brickId },
      search: {},
      resetScroll: false,
    });
  }

  function onAddModule(moduleId: string, target: typeof wallInsertionTargetSchema.Type) {
    if (!isActive || target.wallId !== wallId) return false;
    const module = Object.values(modulesHash).find((entry) => entry.id === moduleId);
    if (module === undefined) return false;
    const id = session.runSync(makeId(brickV1));
    const result = stageAggregateSessionCommand({
      session,
      contractName: "addBrick",
      payload: { id, pageId, moduleId: module.id, target },
    });
    if (result._tag === "Success") onEditBrick(id);
    return result._tag === "Success";
  }

  function onMovePlacement(id: string, target: typeof wallInsertionTargetSchema.Type) {
    const placementId = Schema.decodeUnknownSync(makeModelIdSchema(placementV1))(id);
    return (
      stageAggregateSessionCommand({
        session,
        contractName: "movePlacement",
        payload: { id: crypto.randomUUID(), placementId, target },
      })._tag === "Success"
    );
  }

  function onMoveStack(id: string, target: typeof stackMoveTargetSchema.Type) {
    const stackId = Schema.decodeUnknownSync(makeModelIdSchema(stackV1))(id);
    return (
      stageAggregateSessionCommand({
        session,
        contractName: "moveStack",
        payload: { id: crypto.randomUUID(), stackId, target },
      })._tag === "Success"
    );
  }

  function onDeleteBrick(id: string) {
    const brickId = Schema.decodeUnknownSync(makeModelIdSchema(brickV1))(id);
    const result = stageAggregateSessionCommand({
      session,
      contractName: "deleteBrick",
      payload: { brickId },
    });
    if (result._tag === "Success" && selectedBrickId === brickId) {
      void navigate({
        to: "/$username/site/$siteId/page/$pageId",
        params,
        search: {},
        resetScroll: false,
      });
    }
    return result._tag === "Success";
  }

  const sections = [...(wall?.sections ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      id: section.id,
      stacks: [...section.stacks]
        .sort((a, b) => a.position - b.position)
        .map((stack) => ({
          id: stack.id,
          name: stack.name,
          rows: [...stack.rows]
            .sort((a, b) => a.position - b.position)
            .map((row) => ({
              id: row.id,
              placements: [...row.placements]
                .sort((a, b) => a.position - b.position)
                .map((placement) => {
                  const brick = placement.brick;
                  const module =
                    brick === null || brick === undefined
                      ? undefined
                      : modulesHash[brick.moduleId];
                  const Component = module?.component;
                  return {
                    id: placement.id,
                    brickId: brick?.id ?? "",
                    minWidth: module?.viewFor(breakpoint).minWidth ?? 160,
                    content:
                      Component === undefined ||
                      brick === null ||
                      brick === undefined ||
                      module === undefined ? (
                        <p role="alert">Brick unavailable</p>
                      ) : brick.state === null || isNonEmptySpec(placement.spec) ? (
                        <div
                          data-brick-surface=""
                          data-card-style={cardStyle}
                          className="brick-hover-target relative min-w-0"
                        >
                          <BrickWrapper className="brick-hover-surface h-auto w-full min-w-0">
                            <Component
                              state={brick.state}
                              breakpoint={breakpoint}
                              spec={
                                isNonEmptySpec(placement.spec)
                                  ? placement.spec
                                  : module.defaultSpec
                              }
                            />
                          </BrickWrapper>
                        </div>
                      ) : (
                        <p role="alert">Invalid Brick spec</p>
                      ),
                  };
                }),
            })),
        })),
    }));
  const scope = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{
    element: HTMLElement;
    instruction: Instruction;
  } | null>(null);
  const stackLimit = { sm: 1, md: 2, lg: 3, xl: 4 }[breakpoint];

  useEffect(() => cleanup, []);
  useEffect(() => {
    if (!isActive) {
      setDeletingBrickId(null);
    }
  }, [isActive]);

  // 1. Register only this mounted, active Wall. Content remains interactive; grips drag.
  useEffect(() => {
    const root = rootRef.current;
    const sectionList = sectionsRef.current;
    if (!root || !sectionList || !isActive || wallId === undefined) return;
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
        ? typeof data.moduleId === "string"
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
            const movingStack = stacks.find((entry) => entry.id === source.data.id);
            const occupiedSiblings = siblings.filter(
              (entry) =>
                entry.id !== source.data.id && entry.rows.some((row) => row.placements.length > 0),
            );
            const incomingStackCount = movingStack?.rows.some((row) => row.placements.length > 0)
              ? 1
              : 0;
            const allowed =
              source.data.id !== stack.id &&
              occupiedSiblings.length + incomingStackCount <= stackLimit;
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
          getData: ({ source, input }) => {
            const occupiedStacks = section.stacks.filter(
              (stack) =>
                !(source.data.kind === "stack" && stack.id === source.data.id) &&
                stack.rows.some((row) =>
                  row.placements.some(
                    (placement) =>
                      source.data.kind !== "placement" || placement.id !== source.data.id,
                  ),
                ),
            );
            const movingStack =
              source.data.kind === "stack"
                ? stacks.find((entry) => entry.id === source.data.id)
                : undefined;
            const incomingStackCount =
              source.data.kind === "stack" &&
              !movingStack?.rows.some((row) => row.placements.length > 0)
                ? 0
                : 1;
            const allowed =
              source.data.kind === "wall-module"
                ? section.stacks.length < stackLimit
                : occupiedStacks.length + incomingStackCount <= stackLimit;
            return attachInstruction(
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
                  combine: allowed ? "available" : "blocked",
                },
              },
            );
          },
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
            if (onAddModule(source.data.moduleId, decoded.success) !== false)
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

  if (wall === undefined) {
    return (
      <p role="status" className="p-6">
        This page's wall is unavailable.
      </p>
    );
  }

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
            onRequestDelete={(brickId, triggerId) => {
              returnFocusId.current = triggerId;
              setDeletingBrickId(brickId);
            }}
          />
        ))}
      </div>
      {indicator &&
        createPortal(
          <DropIndicator
            instruction={indicator.instruction}
            lineType={
              indicator.element.hasAttribute("data-wall-placement")
                ? "terminal-no-bleed"
                : undefined
            }
          />,
          indicator.element,
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
              This deletes the shared Brick and its Placements at all four breakpoints, then removes
              empty Rows, Stacks, and Sections.
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
