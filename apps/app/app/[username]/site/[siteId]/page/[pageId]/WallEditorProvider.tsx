"use client";

import { useContext, useEffect, type ReactNode } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";
import { makeIdSchema, makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { isNonEmptySpec } from "@json-render/core";
import { modulesHash } from "../../../../../../modules/lib/modulesHash";
import { WallTree } from "../../../../../../modules/lib/wall/WallTree";
import { wallInsertionTargetSchema } from "../../../../../../modules/lib/wall/wallInsertionTargetSchema";
import { useWallViewport } from "../../../../../../modules/lib/WallViewportProvider";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { placementV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV1";
import { stackV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/stack/StackV1";
import { pageV3 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { WallEditorContext } from "./WallEditorContext";
import { UserUI } from "@/zerospin/UserUI";
import { BrickWrapper } from "../../../../../../modules/components/brick/BrickWrapper";
import { BrickCardStyleContext } from "../../../../../../modules/lib/BrickCardStyleContext";

/** App owns saved rows and commands; shared wall controls receive presentation and callbacks. */
export function WallEditorProvider(props: { children: ReactNode }) {
  const { children } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const params = useParams({ from: "/$username/site/$siteId/page/$pageId" });
  const pageId = Schema.decodeUnknownSync(makeIdSchema(pageV3))(params.pageId);
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const navigate = useNavigate();
  const session = UserUI.useSession();
  const { activeBreakpoint } = useWallViewport();
  const { data: walls } = useLiveQuery({
    session,
    key: pageId,
    query: (db, id) =>
      db.query.wall.findMany({
        where: { pageId: { eq: id } },
        with: {
          sections: {
            with: {
              stacks: { with: { rows: { with: { placements: { with: { brick: true } } } } } },
            },
          },
        },
      }),
  });
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
  const activeWall = walls.find((wall) => wall.breakpoint === activeBreakpoint);
  const targetWallId = insertionTarget?.wallId;
  const insertionValue = search.insertion;
  useEffect(() => {
    if (activeBreakpoint === null) return;
    if (
      insertionValue !== undefined &&
      (targetWallId === undefined || targetWallId !== activeWall?.id)
    ) {
      void navigate({ to: ".", replace: true, search: {}, resetScroll: false });
    }
  }, [activeBreakpoint, activeWall?.id, insertionValue, targetWallId, navigate]);

  function editBrick(brickId: string) {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
      params: { ...params, brickId },
      search: {},
      resetScroll: false,
    });
  }

  function addBrick(moduleId: keyof typeof modulesHash, target = insertionTarget) {
    if (target === null || target.wallId !== activeWall?.id) return false;
    const id = session.runSync(makeId(brickV1));
    const result = stageAggregateSessionCommand({
      session,
      contractName: "addBrick",
      payload: { id, pageId, moduleId, target },
    });
    if (result._tag === "Success") editBrick(id);
    return result._tag === "Success";
  }

  return (
    <WallEditorContext
      value={{
        activeWallId: activeWall?.id ?? null,
        insertionTarget: insertionTarget?.wallId === activeWall?.id ? insertionTarget : null,
        addBrick,
        renderWall: (breakpoint) => {
          const wall = walls.find((entry) => entry.breakpoint === breakpoint);
          if (wall === undefined)
            return (
              <p role="status" className="p-6">
                This page's wall is unavailable.
              </p>
            );
          return (
            <WallTree
              wallId={wall.id}
              isActive={breakpoint === activeBreakpoint}
              breakpoint={breakpoint}
              selectedBrickId={selectedBrickId}
              sections={[...wall.sections]
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
                }))}
              onAddModule={(moduleId, target) => {
                if (Object.hasOwn(modulesHash, moduleId)) {
                  const module = Object.values(modulesHash).find((entry) => entry.id === moduleId);
                  if (module !== undefined) return addBrick(module.id, target);
                }
                return false;
              }}
              onMovePlacement={(id, target) => {
                const placementId = Schema.decodeUnknownSync(makeIdSchema(placementV1))(id);
                return (
                  stageAggregateSessionCommand({
                    session,
                    contractName: "movePlacement",
                    payload: {
                      id: crypto.randomUUID(),
                      placementId,
                      target,
                    },
                  })._tag === "Success"
                );
              }}
              onMoveStack={(id, target) => {
                const stackId = Schema.decodeUnknownSync(makeIdSchema(stackV1))(id);
                return (
                  stageAggregateSessionCommand({
                    session,
                    contractName: "moveStack",
                    payload: {
                      id: crypto.randomUUID(),
                      stackId,
                      target,
                    },
                  })._tag === "Success"
                );
              }}
              onEditBrick={editBrick}
              onDeleteBrick={(id) => {
                const brickId = Schema.decodeUnknownSync(makeIdSchema(brickV1))(id);
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
              }}
            />
          );
        },
      }}
    >
      {children}
    </WallEditorContext>
  );
}
