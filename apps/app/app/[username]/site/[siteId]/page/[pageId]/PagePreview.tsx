"use client";

import { Dialog } from "@base-ui/react/dialog";
import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachInstruction,
  extractInstruction,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import {
  attachClosestEdge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box";
import { useNavigate, useParams } from "@tanstack/react-router";
import { isNonEmptySpec } from "@json-render/core";
import { useEffect, useId, useRef, useState } from "react";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { useLiveQuery } from "@zerospin/react";
import { Result, Schema } from "effect";
import { wallInsertionTargetSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
import { canShareRow } from "@qrk.sh/zerospin/src/modules/lib/canShareRow";

import { Button } from "../../../../../../modules/components/ui/button";
import { StackAction } from "../../../../../../modules/components/StackAction";
import { BrickWrapper } from "../../../../../../modules/components/brick/BrickWrapper";
import { BREAKPOINTS } from "../../../../../../modules/lib/breakpoints";
import { BrowserChrome } from "../../../../../../modules/lib/BrowserChrome";
import { WallPlacement } from "../../../../../../modules/lib/wall/WallPlacement";
import { modulesHash } from "../../../../../../modules/lib/modulesHash";
import { makeWallLayoutView } from "../../../../../../modules/lib/wall/makeWallLayoutView";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";
import { SiteHeader } from "../../SiteHeader";

const DrawerBrickData = Schema.Struct({
  type: Schema.Literal("drawer-brick"),
  moduleId: brickV1.attributesSchema.fields.moduleId,
});

export function PagePreview(props: { breakpoint: (typeof BREAKPOINTS)[number] }) {
  const { breakpoint } = props;
  const wallRef = useRef<HTMLDivElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const scope = useId();
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<typeof wallInsertionTargetSchema.Type | null>(null);
  const navigate = useNavigate();
  const { brickId: selectedBrickId } = useParams({ strict: false });
  const session = UserUI.useSession();
  const params = useValidatedParams(
    Schema.Struct({
      username: Schema.String,
      siteId: makeIdSchema(siteV1),
      pageId: makeIdSchema(pageV1),
    }),
  );
  const { siteId, pageId, username } = params;
  const { data: wall } = useLiveQuery({
    session,
    key: { siteId, pageId, breakpoint: breakpoint.id },
    query: (db, { siteId, pageId, breakpoint }) =>
      db.query.wall.findFirstOrThrow({
        where: {
          pageId: { eq: pageId },
          breakpoint: { eq: breakpoint },
          page: { siteId: { eq: siteId } },
        },
        with: {
          page: { with: { site: true } },
          placements: { with: { brick: true } },
        },
      }),
  });

  const { sections } = makeWallLayoutView({ wall });

  useEffect(() => {
    const element = wallRef.current;
    if (element === null) throw new Error("Missing Wall editor");
    const { sections } = makeWallLayoutView({ wall });
    const cleanups = [
      monitorForElements({
        canMonitor: ({ source }) => Schema.is(DrawerBrickData)(source.data),
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
          const id = session.runSync(makeId(brickV1));
          const result = stageAggregateSessionCommand({
            session,
            contractName: "addBrick",
            payload: { id, pageId, moduleId: data.success.moduleId, target: target.success },
          });
          if (result._tag !== "Success") return;
          void navigate({
            to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
            params: { username, siteId, pageId, brickId: id },
            search: (previous) => ({
              ...previous,
              breakpoint: breakpoint.id,
              insertion: undefined,
            }),
            resetScroll: false,
          });
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
                const instruction = extractInstruction(
                  attachInstruction(
                    {},
                    {
                      element: rowElement,
                      input,
                      operations: {
                        "reorder-before": "available",
                        "reorder-after": "available",
                        combine: canShareRow({
                          incomingVariant: modulesHash[data.moduleId].variants.default,
                          existingVariants,
                        })
                          ? "available"
                          : "not-available",
                      },
                    },
                  ),
                );
                if (row.placements.length === 0 || instruction?.operation === "combine") {
                  return { wallId: wall.id, kind: "row", rowId: row.id, beforePlacementId: null };
                }
                return {
                  wallId: wall.id,
                  kind: "stack",
                  stackId: stack.id,
                  beforeRowId:
                    instruction?.operation === "reorder-before"
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
                  return (
                    extractInstruction(
                      attachInstruction(
                        {},
                        {
                          element: rowElement,
                          input,
                          operations: {
                            "reorder-before": "available",
                            "reorder-after": "available",
                            combine: canShareRow({
                              incomingVariant: module.variants.default,
                              existingVariants,
                            })
                              ? "available"
                              : "not-available",
                          },
                        },
                      ),
                    )?.operation === "combine"
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
    };
  }, [breakpoint.id, navigate, pageId, session, siteId, username, wall]);

  function editBrick(brickId: string) {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
      params: { ...params, brickId },
      search: (previous) => ({ ...previous, breakpoint: breakpoint.id, insertion: undefined }),
      resetScroll: false,
    });
  }

  return (
    <>
      <BrowserChrome breakpoint={breakpoint.id} previewWidth={breakpoint.previewWidth}>
        <div
          className="wall-preview-scroll min-h-0 flex-1 overflow-y-auto bg-white"
          role="region"
          aria-label={`${breakpoint.id} page preview`}
        >
          <div className="@container grid min-h-full grid-rows-[auto_1fr]">
            <SiteHeader />
            <div
              ref={wallRef}
              tabIndex={-1}
              className={`@container relative flex min-h-80 min-w-0 flex-col bg-background outline-none ${dropTarget?.kind === "wall" ? "bg-blue-50 outline-2 outline-blue-500 -outline-offset-2" : ""}`}
              aria-label={`${breakpoint.id} Wall editor`}
            >
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
                        <div key={row.id} data-wall-row-id={row.id} className="relative min-w-0">
                          {dropTarget?.kind === "stack" &&
                            dropTarget.stackId === stack.id &&
                            dropTarget.beforeRowId === row.id && (
                              <span
                                aria-hidden="true"
                                data-wall-drop-indicator="top"
                                className="pointer-events-none absolute inset-x-0 inset-y-px z-30"
                              >
                                <DropIndicator edge="top" type="terminal-no-bleed" />
                              </span>
                            )}
                          <div
                            className={`relative flex min-h-12 min-w-0 items-start overflow-x-auto ${row.placements.length === 0 && dropTarget?.kind === "row" && dropTarget.rowId === row.id ? "bg-blue-50 outline outline-blue-500 -outline-offset-2" : ""}`}
                          >
                            {row.placements.map((placement) => {
                              const brick = placement.brick;
                              const module = modulesHash[brick.moduleId];
                              const Component = module.component;
                              return (
                                <WallPlacement
                                  key={placement.id}
                                  scope={scope}
                                  selected={brick.id === selectedBrickId}
                                  dropEdge={
                                    dropTarget?.kind === "row" && dropTarget.rowId === row.id
                                      ? dropTarget.beforePlacementId === placement.id
                                        ? "left"
                                        : dropTarget.beforePlacementId === null &&
                                            row.placements.at(-1)?.id === placement.id
                                          ? "right"
                                          : null
                                      : null
                                  }
                                  onEditBrick={editBrick}
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
                                          className={`brick-surface ${wall.page.site.cardStyle ? "brick-surface-card" : "brick-surface-flat"} brick-hover-target relative min-w-0`}
                                        >
                                          <BrickWrapper className="brick-hover-surface h-auto">
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
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {stack.rows.length > 0 &&
                        dropTarget?.kind === "stack" &&
                        dropTarget.stackId === stack.id &&
                        dropTarget.beforeRowId === null && (
                          <span
                            aria-hidden="true"
                            data-wall-drop-indicator="bottom"
                            className="pointer-events-none absolute inset-x-0 inset-y-px z-30"
                          >
                            <DropIndicator edge="bottom" type="terminal-no-bleed" />
                          </span>
                        )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </BrowserChrome>
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
                  const brickId = Schema.decodeUnknownSync(makeIdSchema(brickV1))(deletingBrickId);
                  const result = stageAggregateSessionCommand({
                    session,
                    contractName: "deleteBrick",
                    payload: { brickId },
                  });
                  if (result._tag !== "Success") return;
                  setDeletingBrickId(null);
                  if (selectedBrickId === brickId) {
                    void navigate({
                      to: "/$username/site/$siteId/page/$pageId",
                      params,
                      search: (previous) => ({
                        ...previous,
                        breakpoint: breakpoint.id,
                        insertion: undefined,
                      }),
                      resetScroll: false,
                    });
                  }
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
