"use client";

import "@fontsource/silkscreen/400.css";
import { Dialog } from "@base-ui/react/dialog";
import type { IInferModelRow } from "@zerospin/core/models/types";
import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { isNonEmptySpec } from "@json-render/core";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { wallV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/wall/WallV1";
import { useLiveQuery } from "@zerospin/react";
import { Result, Schema } from "effect";
import { wallInsertionTargetSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
import { canShareRow } from "@qrk.sh/zerospin/src/modules/lib/canShareRow";

import { Button } from "../../components/ui/button";
import { StackAction } from "../../components/StackAction";
import { BrickWrapper } from "../../components/brick/BrickWrapper";
import { WallPlacement } from "./WallPlacement";
import { PreviewSection } from "../PreviewSection";
import { modulesHash } from "../modulesHash";
import { makeWallLayoutView } from "./makeWallLayoutView";
import { UserUI } from "@/zerospin/UserUI";

const DrawerBrickData = Schema.Struct({
  type: Schema.Literal("drawer-brick"),
  moduleId: brickV2.attributesSchema.fields.moduleId,
  state: Schema.Unknown,
});

/** Shared interactive Wall; its host owns navigation and the surrounding page chrome. */
export function WallEditor(props: {
  wallId: IInferModelRow<typeof wallV1>["id"];
  selectedBrickId?: string | null;
  onEditBrick?: (brickId: string) => void;
  onBrickDeleted?: (brickId: string) => void;
}) {
  const { wallId, selectedBrickId, onEditBrick, onBrickDeleted } = props;
  const wallRef = useRef<HTMLDivElement>(null);
  const shadowTargetRef = useRef<typeof wallInsertionTargetSchema.Type | null>(null);
  const shadowRowHeights = useRef(new Map<HTMLElement, number>());
  const returnFocusId = useRef<string | null>(null);
  const scope = useId();
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<typeof wallInsertionTargetSchema.Type | null>(null);
  const [shadowSource, setShadowSource] = useState<{
    element: HTMLElement;
    moduleId: keyof typeof modulesHash;
  } | null>(null);
  const session = UserUI.useSession();
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

  useLayoutEffect(() => {
    // The ghost's drop payload follows its committed, visible position.
    shadowTargetRef.current = dropTarget;
  }, [dropTarget]);

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
    const cleanups = [
      monitorForElements({
        canMonitor: ({ source }) => Schema.is(DrawerBrickData)(source.data),
        onDragStart: ({ source }) => {
          if (!Schema.is(DrawerBrickData)(source.data)) return;
          shadowRowHeights.current.clear();
          element.querySelectorAll<HTMLElement>("[data-wall-row-id]").forEach((rowElement) => {
            shadowRowHeights.current.set(rowElement, rowElement.getBoundingClientRect().height);
          });
          setShadowSource({ element: source.element, moduleId: source.data.moduleId });
        },
        onDrag: ({ location }) => {
          const target = Schema.decodeUnknownResult(wallInsertionTargetSchema)(
            location.current.dropTargets[0]?.data,
          );
          setDropTarget(
            Result.isSuccess(target) && target.success.wallId === wall.id ? target.success : null,
          );
        },
        onDropTargetChange: ({ location }) => {
          const target = Schema.decodeUnknownResult(wallInsertionTargetSchema)(
            location.current.dropTargets[0]?.data,
          );
          setDropTarget(
            Result.isSuccess(target) && target.success.wallId === wall.id ? target.success : null,
          );
        },
        onDrop: ({ source, location }) => {
          setDropTarget(null);
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
            getDropEffect: () => "copy",
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
                if (!Schema.is(DrawerBrickData)(source.data)) return false;
                const module = modulesHash[source.data.moduleId];
                return (
                  module.maxPerPage === undefined ||
                  wall.placements.filter((placement) => placement.brick.moduleId === module.id)
                    .length < module.maxPerPage
                );
              },
              getData: ({ source, input }) => {
                const data = Schema.decodeUnknownSync(DrawerBrickData)(source.data);
                const canCombine = canShareRow({
                  incomingVariant: modulesHash[data.moduleId].variants.default,
                  existingVariants,
                });
                const rect = rowElement.getBoundingClientRect();
                const height = shadowRowHeights.current.get(rowElement) ?? rect.height;
                // A tall ghost must not move the Row's original insertion zones.
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
              getDropEffect: () => "copy",
            }),
          );
          for (const [placementIndex, placement] of row.placements.entries()) {
            const placementElement = rowElement.querySelector<HTMLElement>(
              `[data-wall-placement-id="${CSS.escape(placement.id)}"]`,
            );
            if (placementElement === null) throw new Error(`Missing Placement ${placement.id}`);
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
      setDropTarget(null);
      setShadowSource(null);
      shadowRowHeights.current.clear();
    };
  }, [onEditBrick, session, wall]);

  const shadow =
    shadowSource !== null && dropTarget !== null ? (
      <div
        ref={setShadowElement}
        aria-hidden="true"
        className={`wall-shadow-placeholder relative min-h-12 min-w-0 shrink-0 opacity-40 ${dropTarget.kind === "row" ? "flex-1" : "overflow-x-auto"}`}
        style={{
          padding: brickGap / 2,
          minWidth:
            dropTarget.kind === "row"
              ? modulesHash[shadowSource.moduleId].variants.default.minWidth + brickGap
              : undefined,
        }}
      >
        <div
          inert
          className="pointer-events-none"
          style={{ minWidth: modulesHash[shadowSource.moduleId].variants.default.minWidth }}
        />
      </div>
    ) : null;

  return (
    <>
      <div
        ref={wallRef}
        tabIndex={-1}
        className="wall-editor relative flex min-w-0 flex-1 flex-col outline-none"
        aria-label={`${wall.breakpoint} Wall editor`}
      >
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
                      className={`group/stack relative min-h-12 min-w-0 ${stack.rows.length === 0 && dropTarget?.kind === "stack" && dropTarget.stackId === stack.id ? "bg-blue-50 outline outline-blue-500 -outline-offset-2" : ""}`}
                    >
                      {stack.rows.some((row) => row.placements.length > 0) ? (
                        <StackAction>
                          <span className="min-w-0 truncate">{stack.name}</span>
                        </StackAction>
                      ) : null}
                      {stack.rows.map((row) => (
                        <Fragment key={row.id}>
                          {dropTarget?.kind === "stack" &&
                            dropTarget.stackId === stack.id &&
                            dropTarget.beforeRowId === row.id &&
                            shadow}
                          <div data-wall-row-id={row.id} className="relative flow-root min-w-0">
                            <div
                              className={`relative -m-[0.5px] flex min-h-[49px] min-w-0 items-start p-[0.5px] ${row.placements.length === 0 && dropTarget?.kind === "row" && dropTarget.rowId === row.id ? "bg-blue-50 outline outline-blue-500 -outline-offset-2" : ""}`}
                            >
                              {row.placements.map((placement) => {
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
                                        minWidth: module.variants[placement.variantId].minWidth,
                                        content:
                                          brick.state === null || isNonEmptySpec(placement.spec) ? (
                                            <div
                                              className={`brick-surface ${wall.page.site.cardStyle ? "brick-surface-card" : ""} brick-hover-target relative min-w-0`}
                                            >
                                              <BrickWrapper
                                                borderWidth={brick.borderWidth}
                                                className="brick-hover-surface h-auto"
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
                                            </div>
                                          ) : (
                                            <p role="alert">Invalid Brick spec</p>
                                          ),
                                      }}
                                    />
                                  </Fragment>
                                );
                              })}
                              {dropTarget?.kind === "row" &&
                                dropTarget.rowId === row.id &&
                                dropTarget.beforePlacementId === null &&
                                shadow}
                            </div>
                          </div>
                        </Fragment>
                      ))}
                      {dropTarget?.kind === "stack" &&
                        dropTarget.stackId === stack.id &&
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
        <PreviewSection className="flex h-16 shrink-0 items-center justify-end gap-1 rounded-b-[var(--wall-frame-radius,12px)] bg-white px-3 text-[10px] leading-4 text-black/60 shadow-[inset_0_1px_0_var(--color-zinc-200)]">
          <span>powered by</span>
          <span style={{ fontFamily: "Silkscreen, monospace" }}>qrk.sh</span>
        </PreviewSection>
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
