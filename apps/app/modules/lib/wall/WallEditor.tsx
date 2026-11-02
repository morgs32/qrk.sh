"use client";

import "@fontsource/silkscreen/400.css";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import type { IInferModelRow } from "@zerospin/core/models/types";
import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
  type ElementEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { isNonEmptySpec } from "@json-render/core";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { wallV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV2";
import { useLiveQuery, useSession } from "@zerospin/react";
import { Result, Schema } from "effect";
import { wallInsertionTargetSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
import { canShareRow } from "@qrk.sh/zerospin/src/modules/lib/canShareRow";

import { Button } from "../../components/ui/button";
import { StackAction } from "../../components/StackAction";
import { BrickWrapper } from "../../components/brick/BrickWrapper";
import { WallPlacement } from "./WallPlacement";
import { WallDropIndicator } from "./WallDropIndicator";
import { PreviewSection } from "../PreviewSection";
import { modulesHash } from "../modulesHash";
import { makeWallLayoutView } from "./makeWallLayoutView";
import { useWallResize } from "./useWallResize";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

const DrawerBrickData = Schema.Struct({
  type: Schema.Literal("drawer-brick"),
  moduleId: brickV2.attributesSchema.fields.moduleId,
  state: Schema.Unknown,
});

const WallPlacementData = Schema.Struct({
  type: Schema.Literal("wall-placement"),
  wallId: makeIdSchema(wallV2),
  rowId: Schema.String,
  placementId: Schema.String,
});

/** Shared interactive Wall; its host owns navigation and the surrounding page chrome. */
export function WallEditor(props: {
  wallId: IInferModelRow<typeof wallV2>["id"];
  selectedBrickId?: string | null;
  selectedStackId?: string | null;
  onEditBrick?: (brickId: string) => void;
  onEditStack?: (stackId: string) => void;
  onBrickDeleted?: (brickId: string) => void;
}) {
  const { wallId, selectedBrickId, selectedStackId, onEditBrick, onEditStack, onBrickDeleted } =
    props;
  const wallRef = useRef<HTMLDivElement>(null);
  const moveIndicatorRef = useRef<HTMLDivElement>(null);
  const shadowTargetRef = useRef<typeof wallInsertionTargetSchema.Type | null>(null);
  const shadowRowHeights = useRef(new Map<HTMLElement, number>());
  const returnFocusId = useRef<string | null>(null);
  const scope = useId();
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<
    | { kind: "row"; rowId: string; beforePlacementId: string | null }
    | { kind: "stack"; stackId: string; rowId: string | null; edge: "top" | "bottom" }
    | null
  >(null);
  const [dropFeedback, setDropFeedback] = useState<{
    target: typeof wallInsertionTargetSchema.Type;
    ownerRowId: string | null;
  } | null>(null);
  const dropTarget = dropFeedback?.target ?? null;
  const [nativeDragActive, setNativeDragActive] = useState(false);
  const [shadowSource, setShadowSource] = useState<{
    element: HTMLElement;
    moduleId: keyof typeof modulesHash;
  } | null>(null);
  const session = useSession(userSessionDefinition);
  const { data: wall } = useLiveQuery({
    session,
    key: wallId,
    query: (db, id) =>
      db.query.wall.findFirstOrThrow({
        where: { id: { eq: id } },
        with: {
          page: { with: { site: true } },
          placements: { with: { brick: true } },
        },
      }),
  });
  const { sections } = makeWallLayoutView({ wall });
  const { brickGap } = wall.page.site;
  const resize = useWallResize({ wallId, sections, brickGap, wallRef, disabled: nativeDragActive });

  useLayoutEffect(() => {
    // The ghost's drop payload follows its committed, visible position.
    shadowTargetRef.current = dropTarget;
  }, [dropTarget]);

  useLayoutEffect(() => {
    if (moveFeedback === null) return;
    const root = wallRef.current;
    const indicator = moveIndicatorRef.current;
    if (root === null || indicator === null) throw new Error("Missing move indicator host");
    const target = root.querySelector<HTMLElement>(
      moveFeedback.kind === "row"
        ? `[data-wall-row-id="${CSS.escape(moveFeedback.rowId)}"]`
        : moveFeedback.rowId === null
          ? `[data-wall-stack-id="${CSS.escape(moveFeedback.stackId)}"]`
          : `[data-wall-row-id="${CSS.escape(moveFeedback.rowId)}"]`,
    );
    if (target === null) {
      setMoveFeedback(null);
      return;
    }
    const updateBounds = () => {
      if (!root.contains(target)) {
        setMoveFeedback(null);
        return;
      }
      const rootBox = root.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      let left = targetBox.left;
      if (moveFeedback.kind === "row") {
        const placements = target.querySelectorAll<HTMLElement>("[data-wall-placement-id]");
        const anchor =
          moveFeedback.beforePlacementId === null
            ? placements[placements.length - 1]
            : target.querySelector<HTMLElement>(
                `[data-wall-placement-id="${CSS.escape(moveFeedback.beforePlacementId)}"]`,
              );
        if (moveFeedback.beforePlacementId !== null && anchor === null) {
          setMoveFeedback(null);
          return;
        }
        if (anchor !== undefined && anchor !== null) {
          const anchorBox = anchor.getBoundingClientRect();
          left = moveFeedback.beforePlacementId === null ? anchorBox.right : anchorBox.left;
        }
      }
      // Only feedback escapes the query container; content keeps its existing layer.
      indicator.style.left = `${left - rootBox.left}px`;
      indicator.style.top = `${targetBox.top - rootBox.top}px`;
      indicator.style.width = `${moveFeedback.kind === "row" ? 0 : targetBox.width}px`;
      indicator.style.height = `${targetBox.height}px`;
    };
    updateBounds();
    const resize = new ResizeObserver(updateBounds);
    resize.observe(root);
    resize.observe(target);
    target
      .querySelectorAll("[data-wall-placement-id]")
      .forEach((placement) => resize.observe(placement));
    const mutations = new MutationObserver(updateBounds);
    mutations.observe(root, { childList: true, subtree: true });
    document.addEventListener("scroll", updateBounds, true);
    window.addEventListener("resize", updateBounds);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      document.removeEventListener("scroll", updateBounds, true);
      window.removeEventListener("resize", updateBounds);
    };
  }, [moveFeedback]);

  const setShadowElement = useCallback(
    (element: HTMLDivElement | null) => {
      if (element === null || shadowSource === null) return;
      const surface = shadowSource.element.querySelector<HTMLElement>(".brick-hover-surface");
      const content = element.firstElementChild;
      if (surface === null || !(content instanceof HTMLElement))
        throw new Error("Missing drawer Brick shadow surface");
      content.replaceChildren(surface.cloneNode(true));
      return dropTargetForElements({
        element,
        canDrop: ({ source }) => {
          if (
            shadowTargetRef.current === null ||
            !Schema.is(DrawerBrickData)(source.data) ||
            source.data.moduleId !== shadowSource.moduleId
          )
            return false;
          const module = modulesHash[source.data.moduleId];
          return (
            module.maxPerPage === undefined ||
            wall.placements.filter((placement) => placement.brick.moduleId === module.id).length <
              module.maxPerPage
          );
        },
        getData: () => shadowTargetRef.current ?? {},
        getDropEffect: () => "copy",
      });
    },
    [shadowSource, wall],
  );

  useEffect(() => {
    const element = wallRef.current;
    if (element === null) throw new Error("Missing Wall editor");
    const { sections } = makeWallLayoutView({ wall });
    let movingElement: HTMLElement | null = null;
    const stacks = sections.flatMap((section) => section.stacks);
    const rows = stacks.flatMap((stack) => stack.rows);
    const resolveMove = (props: ElementEventBasePayload) => {
      const { source, location } = props;
      const data = Schema.decodeUnknownResult(WallPlacementData)(source.data);
      const target = Schema.decodeUnknownResult(wallInsertionTargetSchema)(
        location.current.dropTargets[0]?.data,
      );
      if (
        movingElement?.querySelector("[data-wall-drag-handle]") !== source.element ||
        !source.element.isConnected ||
        Result.isFailure(data) ||
        Result.isFailure(target) ||
        data.success.wallId !== wall.id ||
        target.success.wallId !== wall.id ||
        (target.success.kind !== "row" && target.success.kind !== "stack")
      )
        return null;
      const destination = target.success;
      const sourceRow = rows.find((row) => row.id === data.success.rowId);
      const placement = sourceRow?.placements.find(
        (placement) => placement.id === data.success.placementId,
      );
      if (sourceRow === undefined || placement === undefined) return null;
      if (destination.kind === "row") {
        const row = rows.find((row) => row.id === destination.rowId);
        if (
          row === undefined ||
          (destination.beforePlacementId !== null &&
            !row.placements.some((entry) => entry.id === destination.beforePlacementId))
        )
          return null;
        const sourceIndex = sourceRow.placements.indexOf(placement);
        if (
          row === sourceRow &&
          (destination.beforePlacementId === placement.id ||
            destination.beforePlacementId === (sourceRow.placements[sourceIndex + 1]?.id ?? null))
        )
          return null;
        if (
          !canShareRow({
            incomingVariant: modulesHash[placement.brick.moduleId].variants[placement.variantId],
            existingVariants: row.placements
              .filter((entry) => entry.id !== placement.id)
              .map((entry) => modulesHash[entry.brick.moduleId].variants[entry.variantId]),
          })
        )
          return null;
      } else {
        const stack = stacks.find((stack) => stack.id === destination.stackId);
        if (
          stack === undefined ||
          (destination.beforeRowId !== null &&
            !stack.rows.some((row) => row.id === destination.beforeRowId))
        )
          return null;
        const sourceRowIndex = stack.rows.indexOf(sourceRow);
        if (
          sourceRow.placements.length === 1 &&
          sourceRowIndex >= 0 &&
          (destination.beforeRowId === sourceRow.id ||
            destination.beforeRowId === (stack.rows[sourceRowIndex + 1]?.id ?? null))
        )
          return null;
      }
      return { placement, target: destination };
    };
    const onMoveDrag = (props: ElementEventBasePayload) => {
      const { location } = props;
      const move = resolveMove(props);
      if (move === null) {
        setMoveFeedback(null);
        return;
      }
      const { target } = move;
      const innermost = location.current.dropTargets[0];
      if (target.kind === "stack") {
        const stack = stacks.find((stack) => stack.id === target.stackId);
        if (stack === undefined) throw new Error(`Missing destination Stack ${target.stackId}`);
        const ownerRowId = innermost.element.getAttribute("data-wall-row-id");
        setMoveFeedback({
          kind: "stack",
          stackId: stack.id,
          rowId: ownerRowId,
          edge:
            ownerRowId === null
              ? stack.rows.length === 0
                ? "top"
                : "bottom"
              : target.beforeRowId === ownerRowId
                ? "top"
                : "bottom",
        });
        return;
      }
      const row = rows.find((row) => row.id === target.rowId);
      if (row === undefined) throw new Error(`Missing destination Row ${target.rowId}`);
      setMoveFeedback({
        kind: "row",
        rowId: row.id,
        beforePlacementId: target.beforePlacementId,
      });
    };
    const onDrag = (props: ElementEventBasePayload) => {
      const { location } = props;
      const innermost = location.current.dropTargets[0];
      const target = Schema.decodeUnknownResult(wallInsertionTargetSchema)(innermost?.data);
      if (Result.isFailure(target) || target.success.wallId !== wall.id) {
        setDropFeedback(null);
        return;
      }
      const ownerRowId =
        innermost?.element.closest("[data-wall-row-id]")?.getAttribute("data-wall-row-id") ?? null;
      setDropFeedback((current) => ({
        target: target.success,
        // After A and before B share a command target; keep the visible seam's owner.
        ownerRowId:
          ownerRowId !== null &&
          current?.ownerRowId !== null &&
          current?.target.kind === "stack" &&
          target.success.kind === "stack" &&
          current.target.stackId === target.success.stackId &&
          current.target.beforeRowId === target.success.beforeRowId
            ? current.ownerRowId
            : ownerRowId,
      }));
    };
    const cleanups = [
      monitorForElements({
        canMonitor: ({ source }) =>
          Schema.is(WallPlacementData)(source.data) &&
          source.data.wallId === wall.id &&
          element.contains(source.element),
        onDragStart: ({ source }) => {
          setNativeDragActive(true);
          movingElement = source.element.closest<HTMLElement>("[data-wall-placement-id]");
          if (movingElement === null) throw new Error("Missing moving Placement");
          movingElement.dataset.wallMoving = "true";
        },
        onDrag: onMoveDrag,
        onDropTargetChange: onMoveDrag,
        onDrop: (props) => {
          const { source } = props;
          setNativeDragActive(false);
          const move = resolveMove(props);
          movingElement?.removeAttribute("data-wall-moving");
          movingElement = null;
          setMoveFeedback(null);
          if (move === null || !source.element.isConnected) return;
          const { placement, target } = move;
          if (target.kind === "row") {
            const row = rows.find((row) => row.id === target.rowId);
            if (row === undefined) throw new Error(`Missing destination Row ${target.rowId}`);
            const before =
              target.beforePlacementId === null
                ? null
                : row.placements.find((entry) => entry.id === target.beforePlacementId);
            if (before === undefined) throw new Error("Missing destination Placement anchor");
            stageAggregateSessionCommand({
              session,
              contractName: "movePlacementToRow",
              payload: {
                placementId: placement.id,
                rowId: row.id,
                beforePlacementId: before === null ? null : before.id,
              },
            });
          } else {
            const stack = stacks.find((stack) => stack.id === target.stackId);
            if (stack === undefined) throw new Error(`Missing destination Stack ${target.stackId}`);
            const before =
              target.beforeRowId === null
                ? null
                : stack.rows.find((row) => row.id === target.beforeRowId);
            if (before === undefined) throw new Error("Missing destination Row anchor");
            stageAggregateSessionCommand({
              session,
              contractName: "movePlacementToNewRow",
              payload: {
                placementId: placement.id,
                stackId: stack.id,
                newRowId: session.runSync(makeId({ abbreviation: "row" })),
                beforeRowId: before === null ? null : before.id,
              },
            });
          }
        },
      }),
      monitorForElements({
        canMonitor: ({ source }) => Schema.is(DrawerBrickData)(source.data),
        onDragStart: ({ source }) => {
          if (!Schema.is(DrawerBrickData)(source.data)) return;
          setNativeDragActive(true);
          shadowRowHeights.current.clear();
          element.querySelectorAll<HTMLElement>("[data-wall-row-id]").forEach((rowElement) => {
            shadowRowHeights.current.set(rowElement, rowElement.getBoundingClientRect().height);
          });
          setShadowSource({ element: source.element, moduleId: source.data.moduleId });
        },
        onDrag,
        onDropTargetChange: onDrag,
        onDrop: ({ source, location }) => {
          setNativeDragActive(false);
          setDropFeedback(null);
          setShadowSource(null);
          shadowRowHeights.current.clear();
          const data = Schema.decodeUnknownResult(DrawerBrickData)(source.data);
          const target = Schema.decodeUnknownResult(wallInsertionTargetSchema)(
            location.current.dropTargets[0]?.data,
          );
          if (
            Result.isFailure(data) ||
            Result.isFailure(target) ||
            target.success.wallId !== wall.id ||
            !source.element.isConnected
          )
            return;
          const id = session.runSync(makeId(brickV2));
          const result = stageAggregateSessionCommand({
            session,
            contractName: "addBrick",
            payload: {
              id,
              pageId: wall.pageId,
              moduleId: data.success.moduleId,
              state: data.success.state,
              target: target.success,
            },
          });
          if (result._tag !== "Success") return;
          onEditBrick?.(id);
        },
      }),
    ];

    if (sections.length === 0) {
      cleanups.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => {
            if (!Schema.is(DrawerBrickData)(source.data)) return false;
            const module = modulesHash[source.data.moduleId];
            return (
              module.maxPerPage === undefined ||
              wall.placements.filter((placement) => placement.brick.moduleId === module.id).length <
                module.maxPerPage
            );
          },
          getData: () => ({ wallId: wall.id, kind: "wall", beforeSectionId: null }),
          getDropEffect: () => "copy",
        }),
      );
    }
    for (const section of sections) {
      for (const stack of section.stacks) {
        const stackElement = element.querySelector<HTMLElement>(
          `[data-wall-stack-id="${CSS.escape(stack.id)}"]`,
        );
        if (stackElement === null) throw new Error(`Missing Stack ${stack.id}`);
        cleanups.push(
          dropTargetForElements({
            element: stackElement,
            canDrop: ({ source }) => {
              if (Schema.is(WallPlacementData)(source.data))
                return (
                  source.data.wallId === wall.id &&
                  wall.placements.some((placement) => placement.id === source.data.placementId)
                );
              if (!Schema.is(DrawerBrickData)(source.data)) return false;
              const module = modulesHash[source.data.moduleId];
              return (
                module.maxPerPage === undefined ||
                wall.placements.filter((placement) => placement.brick.moduleId === module.id)
                  .length < module.maxPerPage
              );
            },
            getData: () => ({
              wallId: wall.id,
              kind: "stack",
              stackId: stack.id,
              beforeRowId: null,
            }),
            getDropEffect: ({ source }) =>
              Schema.is(WallPlacementData)(source.data) ? "move" : "copy",
          }),
        );
        for (const [rowIndex, row] of stack.rows.entries()) {
          const rowElement = stackElement.querySelector<HTMLElement>(
            `[data-wall-row-id="${CSS.escape(row.id)}"]`,
          );
          if (rowElement === null) throw new Error(`Missing Row ${row.id}`);
          const existingVariants = row.placements.map(
            (placement) => modulesHash[placement.brick.moduleId].variants[placement.variantId],
          );
          cleanups.push(
            dropTargetForElements({
              element: rowElement,
              canDrop: ({ source }) => {
                if (Schema.is(WallPlacementData)(source.data))
                  return (
                    source.data.wallId === wall.id &&
                    wall.placements.some((placement) => placement.id === source.data.placementId)
                  );
                if (!Schema.is(DrawerBrickData)(source.data)) return false;
                const module = modulesHash[source.data.moduleId];
                return (
                  module.maxPerPage === undefined ||
                  wall.placements.filter((placement) => placement.brick.moduleId === module.id)
                    .length < module.maxPerPage
                );
              },
              getData: ({ source, input }) => {
                if (Schema.is(WallPlacementData)(source.data)) {
                  const incoming = wall.placements.find(
                    (placement) => placement.id === source.data.placementId,
                  );
                  if (incoming === undefined) throw new Error("Missing moving Placement");
                  const canCombine = canShareRow({
                    incomingVariant:
                      modulesHash[incoming.brick.moduleId].variants[incoming.variantId],
                    existingVariants: row.placements
                      .filter((placement) => placement.id !== incoming.id)
                      .map(
                        (placement) =>
                          modulesHash[placement.brick.moduleId].variants[placement.variantId],
                      ),
                  });
                  const rect = rowElement.getBoundingClientRect();
                  const beforeRow = canCombine
                    ? input.clientY < rect.top + 8
                    : input.clientY < rect.top + rect.height / 2;
                  const afterRow = canCombine ? input.clientY >= rect.bottom - 8 : !beforeRow;
                  if (row.placements.length > 0 && (beforeRow || afterRow)) {
                    return {
                      wallId: wall.id,
                      kind: "stack",
                      stackId: stack.id,
                      beforeRowId: beforeRow ? row.id : (stack.rows[rowIndex + 1]?.id ?? null),
                    };
                  }
                  const before = row.placements.find((placement) => {
                    const cell = rowElement.querySelector<HTMLElement>(
                      `[data-wall-placement-id="${CSS.escape(placement.id)}"]`,
                    );
                    if (cell === null) throw new Error(`Missing Placement ${placement.id}`);
                    const rect = cell.getBoundingClientRect();
                    return input.clientX < rect.left + rect.width / 2;
                  });
                  return {
                    wallId: wall.id,
                    kind: "row",
                    rowId: row.id,
                    beforePlacementId: before?.id ?? null,
                  };
                }
                const data = Schema.decodeUnknownSync(DrawerBrickData)(source.data);
                const canCombine = canShareRow({
                  incomingVariant: modulesHash[data.moduleId].variants.default,
                  existingVariants,
                });
                const rect = rowElement.getBoundingClientRect();
                const height = shadowRowHeights.current.get(rowElement) ?? rect.height;
                // The enclosing target's top and natural height exclude its own shadow movement.
                const operation = canCombine
                  ? input.clientY <= rect.top + height / 4
                    ? "reorder-before"
                    : input.clientY >= rect.top + (3 * height) / 4
                      ? "reorder-after"
                      : "combine"
                  : input.clientY < rect.top + height / 2
                    ? "reorder-before"
                    : "reorder-after";
                if (row.placements.length === 0 || operation === "combine") {
                  return { wallId: wall.id, kind: "row", rowId: row.id, beforePlacementId: null };
                }
                return {
                  wallId: wall.id,
                  kind: "stack",
                  stackId: stack.id,
                  beforeRowId:
                    operation === "reorder-before"
                      ? row.id
                      : (stack.rows[rowIndex + 1]?.id ?? null),
                };
              },
              getDropEffect: ({ source }) =>
                Schema.is(WallPlacementData)(source.data) ? "move" : "copy",
            }),
          );
          for (const [placementIndex, placement] of row.placements.entries()) {
            const placementElement = rowElement.querySelector<HTMLElement>(
              `[data-wall-placement-id="${CSS.escape(placement.id)}"]`,
            );
            if (placementElement === null) throw new Error(`Missing Placement ${placement.id}`);
            const handle = placementElement.querySelector<HTMLElement>("[data-wall-drag-handle]");
            if (handle === null)
              throw new Error(`Missing drag handle for Placement ${placement.id}`);
            cleanups.push(
              draggable({
                element: handle,
                getInitialData: () => ({
                  type: "wall-placement",
                  wallId: wall.id,
                  rowId: row.id,
                  placementId: placement.id,
                }),
                onGenerateDragPreview: ({ nativeSetDragImage }) => {
                  const surface =
                    placementElement.querySelector<HTMLElement>(".brick-hover-surface");
                  if (surface === null)
                    throw new Error(`Missing Brick surface ${placement.brickId}`);
                  setCustomNativeDragPreview({
                    nativeSetDragImage,
                    getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
                    render: ({ container }) => {
                      const appearance = getComputedStyle(surface);
                      const rect = surface.getBoundingClientRect();
                      container.classList.add("qrk-bricks", "brick-drag-preview");
                      container.classList.toggle("dark", surface.closest(".dark") !== null);
                      container.style.font = appearance.font;
                      container.style.color = appearance.color;
                      const copy = surface.cloneNode(true);
                      if (!(copy instanceof HTMLElement)) throw new Error("Missing Brick preview");
                      copy.style.width = `${rect.width}px`;
                      copy.style.height = `${rect.height}px`;
                      container.append(copy);
                    },
                  });
                },
              }),
            );
            cleanups.push(
              dropTargetForElements({
                element: placementElement,
                canDrop: ({ source, input }) => {
                  if (!Schema.is(DrawerBrickData)(source.data)) return false;
                  const module = modulesHash[source.data.moduleId];
                  if (
                    module.maxPerPage !== undefined &&
                    wall.placements.filter((entry) => entry.brick.moduleId === module.id).length >=
                      module.maxPerPage
                  )
                    return false;
                  const canCombine = canShareRow({
                    incomingVariant: module.variants.default,
                    existingVariants,
                  });
                  const rect = rowElement.getBoundingClientRect();
                  const height = shadowRowHeights.current.get(rowElement) ?? rect.height;
                  return (
                    canCombine &&
                    input.clientY > rect.top + height / 4 &&
                    input.clientY < rect.top + (3 * height) / 4
                  );
                },
                getData: ({ input, element }) => {
                  const edge = extractClosestEdge(
                    attachClosestEdge(
                      {},
                      {
                        element,
                        input,
                        allowedEdges: ["left", "right"],
                      },
                    ),
                  );
                  return {
                    wallId: wall.id,
                    kind: "row",
                    rowId: row.id,
                    beforePlacementId:
                      edge === "left"
                        ? placement.id
                        : (row.placements[placementIndex + 1]?.id ?? null),
                  };
                },
                getDropEffect: () => "copy",
              }),
            );
          }
        }
      }
    }
    return () => {
      combine(...cleanups)();
      movingElement?.removeAttribute("data-wall-moving");
      movingElement = null;
      setNativeDragActive(false);
      setMoveFeedback(null);
      setDropFeedback(null);
      setShadowSource(null);
      shadowRowHeights.current.clear();
    };
  }, [onEditBrick, session, wall]);

  const shadowVariant =
    shadowSource === null ? null : modulesHash[shadowSource.moduleId].variants.default;
  const shadowRow =
    dropTarget?.kind === "row"
      ? sections
          .flatMap((section) => section.stacks)
          .flatMap((stack) => stack.rows)
          .find((row) => row.id === dropTarget.rowId)
      : undefined;
  const shadowWeightScale =
    shadowRow === undefined || shadowVariant === null
      ? 1
      : (shadowRow.placements.length + 1) /
        (shadowVariant.defaultWidth +
          shadowRow.placements.reduce((total, placement) => total + placement.widthWeight, 0));
  const shadow =
    shadowSource !== null && shadowVariant !== null && dropTarget !== null ? (
      <div
        ref={setShadowElement}
        aria-hidden="true"
        className="wall-shadow-placeholder relative opacity-40"
        style={{
          width:
            dropTarget.kind === "row"
              ? undefined
              : dropTarget.kind === "wall"
                ? `calc(100% + ${brickGap}px)`
                : "100%",
          flexBasis: dropTarget.kind === "row" ? 0 : undefined,
          flexGrow: dropTarget.kind === "row" ? shadowVariant.defaultWidth * shadowWeightScale : 0,
          // Empty Walls need the same outer half-gap allowance as populated Rows.
          maxWidth: dropTarget.kind === "wall" ? `calc(100% + ${brickGap}px)` : "100%",
          margin: dropTarget.kind === "wall" ? -brickGap / 2 : undefined,
          padding: brickGap / 2,
          minWidth: shadowVariant.minWidth + brickGap,
        }}
      >
        <div
          inert
          className="pointer-events-none"
          style={{
            minWidth: shadowVariant.minWidth,
            minHeight: Math.max(
              45,
              shadowVariant.minHeight ?? 45,
              dropTarget.kind === "row" ? 45 : (shadowVariant.defaultHeight ?? 45),
            ),
          }}
        />
      </div>
    ) : null;

  return (
    <>
      <div
        ref={wallRef}
        data-wall-resizing={resize.preview?.kind}
        data-wall-resize-disabled={nativeDragActive ? "true" : undefined}
        onDragStartCapture={(event) => {
          if (resize.preview !== null) event.preventDefault();
        }}
        tabIndex={-1}
        className={`wall-editor relative flex min-w-0 flex-1 flex-col outline-none ${wall.page.site.stickyNavbar ? "[--wall-actions-sticky-top:7rem]" : "[--wall-actions-sticky-top:3rem]"}`}
        aria-label={`${wall.breakpoint} Wall editor`}
      >
        {moveFeedback !== null && (
          <div
            ref={moveIndicatorRef}
            data-wall-move-indicator
            data-orientation={moveFeedback.kind === "row" ? "vertical" : "horizontal"}
            aria-hidden="true"
            className="pointer-events-none absolute z-70"
          >
            <WallDropIndicator edge={moveFeedback.kind === "row" ? "left" : moveFeedback.edge} />
          </div>
        )}
        <PreviewSection
          className={`flex-1 ${dropTarget?.kind === "wall" ? "bg-blue-50 outline-2 outline-blue-500 -outline-offset-2" : "bg-[#E6AA80]"}`}
        >
          {sections.length > 0 && (
            <div className="relative min-w-0 shrink-0" style={{ margin: -brickGap / 2 }}>
              {sections.map((section) => (
                <section key={section.id} className="relative grid auto-cols-fr grid-flow-col">
                  {section.stacks.map((stack) => (
                    <div
                      key={stack.id}
                      data-wall-stack-id={stack.id}
                      className={`group/stack relative min-h-[50px] min-w-0 ${stack.id === selectedStackId ? "is-selected-stack after:pointer-events-none after:absolute after:inset-0 after:z-[29] after:border after:border-[#1f9bfc] after:content-['']" : ""} ${stack.rows.length === 0 && dropTarget?.kind === "stack" && dropTarget.stackId === stack.id ? "bg-blue-50 outline outline-blue-500 -outline-offset-2" : ""}`}
                    >
                      {stack.rows.some((row) => row.placements.length > 0) ? (
                        <StackAction>
                          {onEditStack === undefined ? (
                            <span className="min-w-0 truncate">{stack.name}</span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              aria-label={`Edit stack ${stack.name}`}
                              onClick={() => onEditStack(stack.id)}
                              className="h-7 min-w-0 shrink rounded-none px-0 text-xs font-normal text-white hover:bg-transparent hover:text-white"
                            >
                              <span className="truncate">{stack.name}</span>
                            </Button>
                          )}
                          <Menu.Root>
                            <Menu.Trigger
                              render={
                                <Button
                                  variant="ghost"
                                  className="h-7 w-3.5 shrink-0 rounded-none p-0 text-white hover:bg-transparent hover:text-white"
                                />
                              }
                              aria-label={`Stack ${stack.name} actions`}
                            >
                              <Pencil className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                            </Menu.Trigger>
                            <Menu.Portal>
                              <Menu.Positioner
                                side="bottom"
                                align="start"
                                sideOffset={0}
                                className="z-[90]"
                              >
                                <Menu.Popup className="w-max min-w-[90px] max-w-[var(--available-width)] max-h-[var(--available-height)] overflow-y-auto rounded-none border border-[#dedede] bg-white p-0 font-mono text-[15px] leading-[18px] font-normal text-[#111] shadow-[2px_3px_0_#0005] outline-none">
                                  <Menu.Item className="flex min-h-5 cursor-pointer items-center gap-2 px-0.5 py-px outline-none data-[highlighted]:bg-[color-mix(in_srgb,#fff,#111_6%)]">
                                    <ArrowLeft className="size-4" aria-hidden="true" />
                                    Insert left
                                  </Menu.Item>
                                  <Menu.Item className="flex min-h-5 cursor-pointer items-center gap-2 px-0.5 py-px outline-none data-[highlighted]:bg-[color-mix(in_srgb,#fff,#111_6%)]">
                                    <ArrowRight className="size-4" aria-hidden="true" />
                                    Insert right
                                  </Menu.Item>
                                </Menu.Popup>
                              </Menu.Positioner>
                            </Menu.Portal>
                          </Menu.Root>
                        </StackAction>
                      ) : null}
                      {stack.rows.map((row) => {
                        const rowPreview = resize.preview?.rowId === row.id ? resize.preview : null;
                        const rowReadout = resize.readout?.rowId === row.id ? resize.readout : null;
                        const rowMinHeight =
                          rowPreview?.kind === "height" ? rowPreview.minHeight : row.minHeight;
                        const rowPlacements =
                          rowPreview?.kind === "width"
                            ? row.placements.map((placement) => {
                                const changed = rowPreview.placements.find(
                                  (entry) => entry.placementId === placement.id,
                                );
                                if (changed === undefined)
                                  throw new Error("Missing resize preview Placement");
                                return { ...placement, widthWeight: changed.widthWeight };
                              })
                            : row.placements;
                        const incomingVariant =
                          dropTarget?.kind === "row" && dropTarget.rowId === row.id
                            ? shadowVariant
                            : null;
                        const variants = rowPlacements.map(
                          (placement) =>
                            modulesHash[placement.brick.moduleId].variants[placement.variantId],
                        );
                        const minHeight = Math.max(
                          45,
                          rowMinHeight ?? 45,
                          ...variants.map((variant) =>
                            Math.max(
                              variant.minHeight ?? 45,
                              rowMinHeight === null ? (variant.defaultHeight ?? 45) : 45,
                            ),
                          ),
                          incomingVariant === null
                            ? 45
                            : Math.max(
                                incomingVariant.minHeight ?? 45,
                                rowMinHeight === null ? (incomingVariant.defaultHeight ?? 45) : 45,
                              ),
                        );
                        const totalWeight =
                          rowPlacements.reduce(
                            (total, placement) => total + placement.widthWeight,
                            0,
                          ) + (incomingVariant?.defaultWidth ?? 0);
                        const placementCount =
                          row.placements.length + (incomingVariant === null ? 0 : 1);
                        return (
                          <div
                            key={row.id}
                            data-wall-row-id={row.id}
                            className="relative flow-root min-w-0"
                          >
                            {dropTarget?.kind === "stack" &&
                              dropTarget.stackId === stack.id &&
                              dropFeedback?.ownerRowId === row.id &&
                              dropTarget.beforeRowId === row.id &&
                              shadow}
                            <div
                              data-wall-row-content
                              style={{ minHeight: minHeight + brickGap + 1 }}
                              className={`relative -m-[0.5px] flex min-h-[49px] min-w-0 items-stretch p-[0.5px] ${row.placements.length === 0 && dropTarget?.kind === "row" && dropTarget.rowId === row.id ? "bg-blue-50 outline outline-blue-500 -outline-offset-2" : ""}`}
                            >
                              {rowPlacements.map((placement, placementIndex) => {
                                const nextPlacement = rowPlacements[placementIndex + 1];
                                const widthReadout =
                                  rowReadout?.kind === "width" &&
                                  rowReadout.leftPlacementId === placement.id &&
                                  rowReadout.rightPlacementId === nextPlacement?.id
                                    ? rowReadout
                                    : null;
                                const brick = placement.brick;
                                const module = modulesHash[brick.moduleId];
                                const Component = module.component;
                                return (
                                  <Fragment key={placement.id}>
                                    {dropTarget?.kind === "row" &&
                                      dropTarget.rowId === row.id &&
                                      dropTarget.beforePlacementId === placement.id &&
                                      shadow}
                                    <WallPlacement
                                      scope={scope}
                                      brickGap={brickGap}
                                      selected={brick.id === selectedBrickId}
                                      onEditBrick={onEditBrick}
                                      onRequestDelete={(brickId, triggerId) => {
                                        returnFocusId.current = triggerId;
                                        setDeletingBrickId(brickId);
                                      }}
                                      placement={{
                                        id: placement.id,
                                        brickId: brick.id,
                                        widthWeight:
                                          (placement.widthWeight / totalWeight) * placementCount,
                                        minWidth: module.variants[placement.variantId].minWidth,
                                        content:
                                          brick.state === null || isNonEmptySpec(placement.spec) ? (
                                            <BrickWrapper
                                              borderWidth={brick.borderWidth}
                                              className={
                                                wall.page.site.cardStyle
                                                  ? "brick-surface-card"
                                                  : undefined
                                              }
                                            >
                                              <Component
                                                state={brick.state}
                                                variantId={placement.variantId}
                                                spec={
                                                  isNonEmptySpec(placement.spec)
                                                    ? placement.spec
                                                    : module.variants[placement.variantId].spec
                                                }
                                              />
                                            </BrickWrapper>
                                          ) : (
                                            <p role="alert">Invalid Brick spec</p>
                                          ),
                                      }}
                                    />
                                    {nextPlacement !== undefined && (
                                      <span
                                        aria-hidden="true"
                                        className="wall-width-resize-slot relative z-20 w-0 shrink-0 self-stretch"
                                      >
                                        <span
                                          data-wall-width-resize-handle
                                          data-row-id={row.id}
                                          data-left-placement-id={placement.id}
                                          data-right-placement-id={nextPlacement.id}
                                          data-wall-resize-active={
                                            widthReadout === null ? undefined : ""
                                          }
                                          className="wall-resize-grip wall-width-resize-grip"
                                          draggable={false}
                                          onPointerDown={(event) =>
                                            resize.startWidthResize({
                                              event,
                                              rowId: row.id,
                                              leftPlacementId: placement.id,
                                              rightPlacementId: nextPlacement.id,
                                            })
                                          }
                                          onDragStart={(event) => event.preventDefault()}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                          }}
                                        >
                                          {widthReadout !== null && (
                                            <span
                                              data-wall-resize-readout
                                              className="wall-resize-readout"
                                            >
                                              {`${Math.round(widthReadout.leftWidth)} px | ${Math.round(widthReadout.rightWidth)} px`}
                                            </span>
                                          )}
                                        </span>
                                      </span>
                                    )}
                                  </Fragment>
                                );
                              })}
                              {dropTarget?.kind === "row" &&
                                dropTarget.rowId === row.id &&
                                dropTarget.beforePlacementId === null &&
                                shadow}
                            </div>
                            <span
                              aria-hidden="true"
                              data-wall-height-resize-handle
                              data-row-id={row.id}
                              data-wall-resize-active={
                                rowReadout?.kind === "height" ? "" : undefined
                              }
                              className="wall-resize-grip wall-height-resize-grip z-20"
                              draggable={false}
                              onPointerDown={(event) =>
                                resize.startHeightResize({ event, rowId: row.id })
                              }
                              onDoubleClick={() => resize.resetHeight({ rowId: row.id })}
                              onDragStart={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              {rowReadout?.kind === "height" && (
                                <span data-wall-resize-readout className="wall-resize-readout">
                                  {`${Math.round(rowReadout.height)} px`}
                                </span>
                              )}
                            </span>
                            {dropTarget?.kind === "stack" &&
                              dropTarget.stackId === stack.id &&
                              dropFeedback?.ownerRowId === row.id &&
                              dropTarget.beforeRowId !== row.id &&
                              shadow}
                          </div>
                        );
                      })}
                      {dropTarget?.kind === "stack" &&
                        dropTarget.stackId === stack.id &&
                        dropFeedback?.ownerRowId === null &&
                        dropTarget.beforeRowId === null &&
                        shadow}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
          {sections.length === 0 && dropTarget?.kind === "wall" && shadow}
        </PreviewSection>
        <div className="wall-preview-footer relative z-40 h-16 shrink-0 bg-white">
          <PreviewSection className="flex h-16 shrink-0 items-center justify-end gap-1 rounded-b-[var(--wall-frame-radius,12px)] border-b bg-white px-3 text-[10px] leading-4 text-black/60 shadow-[inset_0_1px_0_var(--color-zinc-200)]">
            <span>powered by</span>
            <span style={{ fontFamily: "Silkscreen, monospace" }}>qrk.sh</span>
          </PreviewSection>
        </div>
      </div>
      <Dialog.Root
        open={deletingBrickId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingBrickId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/30" />
          <Dialog.Popup
            finalFocus={() =>
              wallRef.current?.ownerDocument.getElementById(returnFocusId.current ?? "") ??
              wallRef.current?.querySelector<HTMLElement>("button") ??
              wallRef.current
            }
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
                  if (deletingBrickId === null) return;
                  const brickId = Schema.decodeUnknownSync(makeIdSchema(brickV2))(deletingBrickId);
                  const result = stageAggregateSessionCommand({
                    session,
                    contractName: "deleteBrick",
                    payload: { brickId },
                  });
                  if (result._tag !== "Success") return;
                  setDeletingBrickId(null);
                  onBrickDeleted?.(brickId);
                }}
              >
                Delete Brick
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
