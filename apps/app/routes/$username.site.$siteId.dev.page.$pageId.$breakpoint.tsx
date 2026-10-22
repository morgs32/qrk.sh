import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  dropTargetForElements,
  monitorForElements,
  type ElementDropTargetEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { announce, cleanup } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BrickWrapper } from "../modules/components/brick/BrickWrapper";
import { BREAKPOINTS } from "../modules/lib/breakpoints";
import { modulesHash } from "../modules/lib/modulesHash";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { canShareRow } from "@qrk.sh/zerospin/src/modules/lib/canShareRow";
import { makeWallLayoutView } from "../modules/lib/wall/makeWallLayoutView";
import { WallModuleAction } from "../modules/lib/wall/WallModuleAction";
import { wallInsertionTargetSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
import { useLiveQuery } from "@zerospin/react";
import { Result, Schema } from "effect";

import UserLayout from "@/app/[username]/UserLayout";
import NotFound from "@/app/not-found";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";

export const Route = createFileRoute("/$username/site/$siteId/dev/page/$pageId/$breakpoint")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { breakpoint: requestedBreakpoint } = Route.useParams();
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === requestedBreakpoint);
  if (breakpoint === undefined) return <NotFound />;
  return (
    <UserLayout>
      <DevelopmentPage breakpoint={breakpoint} />
    </UserLayout>
  );
}

function DevelopmentPage(props: { breakpoint: (typeof BREAKPOINTS)[number] }) {
  const { breakpoint } = props;
  const wallRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<typeof wallInsertionTargetSchema.Type | null>(null);
  const session = UserUI.useSession();
  const { siteId, pageId } = useValidatedParams(
    Schema.Struct({
      siteId: makeIdSchema(siteV1),
      pageId: makeIdSchema(pageV1),
    }),
  );
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
  const stacks = sections.flatMap((section) => section.stacks);

  /** Choose a destination only; the drag monitor owns feedback and submission. */
  function resolveBrickDrop(props: {
    moduleId: keyof typeof modulesHash;
    zone: typeof wallInsertionTargetSchema.Type;
    rowWidth: number;
  }): typeof wallInsertionTargetSchema.Type | null {
    const { moduleId, zone, rowWidth } = props;
    if (zone.wallId !== wall.id) return null;

    // 1. A hovered Row either accepts sharing or inserts immediately below itself.
    if (zone.kind === "row") {
      const stack = stacks.find((entry) => entry.rows.some((row) => row.id === zone.rowId));
      const row = stack?.rows.find((entry) => entry.id === zone.rowId);
      if (stack === undefined || row === undefined) return null;
      const incomingVariant = modulesHash[moduleId].variants.default;
      const existingVariants = row.placements.map(
        (entry) => modulesHash[entry.brick.moduleId].variants[entry.variantId],
      );
      const occupiedWidth = existingVariants.reduce(
        (width, variant) => width + variant.minWidth,
        0,
      );
      const fits = occupiedWidth + incomingVariant.minWidth <= rowWidth;
      if (fits && canShareRow({ incomingVariant, existingVariants })) {
        return { wallId: wall.id, kind: "row", rowId: row.id, beforePlacementId: null };
      }
      const nextRow = stack.rows[stack.rows.indexOf(row) + 1];
      return {
        wallId: wall.id,
        kind: "stack",
        stackId: stack.id,
        beforeRowId: nextRow?.id ?? null,
      };
    }

    // 2. Blank Stack space appends a Row; stale Stacks never become Wall drops.
    if (zone.kind === "stack") {
      if (!stacks.some((entry) => entry.id === zone.stackId)) return null;
      return { wallId: wall.id, kind: "stack", stackId: zone.stackId, beforeRowId: null };
    }
    if (zone.kind !== "wall") return null;

    // 3. Reuse an empty Page's initial Stack before creating a new Section.
    const hasBricks = stacks.some((stack) => stack.rows.some((row) => row.placements.length > 0));
    const initialStack = stacks[0];
    if (!hasBricks && initialStack !== undefined) {
      return { wallId: wall.id, kind: "stack", stackId: initialStack.id, beforeRowId: null };
    }

    // 4. The populated Wall's bottom creates a Section, Stack, and Row.
    return { wallId: wall.id, kind: "wall", beforeSectionId: null };
  }

  // Read the latest queried Wall without re-registering targets for feedback changes.
  const resolveCurrentDrop = useEffectEvent((event: ElementDropTargetEventBasePayload) => {
    const { source, location } = event;
    if (source.data.kind !== "wall-module" || source.data.wallId !== wall.id) return null;
    const moduleId = Object.values(modulesHash).find(
      (module) => module.id === source.data.moduleId,
    )?.id;
    const hovered = location.current.dropTargets[0];
    if (moduleId === undefined || hovered === undefined) return null;
    const zone = Schema.decodeUnknownResult(wallInsertionTargetSchema)(hovered.data);
    if (Result.isFailure(zone)) return null;
    const target = resolveBrickDrop({
      moduleId,
      zone: zone.success,
      rowWidth: hovered.element.getBoundingClientRect().width,
    });
    return target === null ? null : { moduleId, target };
  });

  const submitDrop = useEffectEvent((event: ElementDropTargetEventBasePayload) => {
    const resolved = resolveCurrentDrop(event);
    setDropTarget(null);
    if (resolved === null) return;
    const id = session.runSync(makeId(brickV1));
    const result = stageAggregateSessionCommand({
      session,
      contractName: "addBrick",
      payload: { id, pageId, moduleId: resolved.moduleId, target: resolved.target },
    });
    if (result._tag === "Success") announce("Brick added to this Wall.");
  });

  useEffect(() => cleanup, []);
  useEffect(() => {
    const root = wallRef.current;
    if (root === null) return;
    const disposers: (() => void)[] = [];
    const accepts = (data: Record<string | symbol, unknown>) =>
      data.kind === "wall-module" &&
      data.wallId === wall.id &&
      Object.values(modulesHash).some((module) => module.id === data.moduleId);

    // DOM registrations follow saved layout changes, never transient highlighting.
    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-dev-row], [data-dev-stack], [data-dev-wall-bottom]",
    )) {
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => accepts(source.data),
          getData: () => {
            if (element.dataset.devRow !== undefined) {
              return {
                wallId: wall.id,
                kind: "row",
                rowId: element.dataset.devRow,
                beforePlacementId: null,
              };
            }
            if (element.dataset.devStack !== undefined) {
              return {
                wallId: wall.id,
                kind: "stack",
                stackId: element.dataset.devStack,
                beforeRowId: null,
              };
            }
            return { wallId: wall.id, kind: "wall", beforeSectionId: null };
          },
        }),
      );
    }
    const showDestination = (event: ElementDropTargetEventBasePayload) => {
      setDropTarget(resolveCurrentDrop(event)?.target ?? null);
    };
    disposers.push(
      monitorForElements({
        canMonitor: ({ source }) => accepts(source.data),
        onDragStart: showDestination,
        onDrag: showDestination,
        onDropTargetChange: showDestination,
        onDrop: submitDrop,
      }),
    );
    return combine(...disposers, () => setDropTarget(null));
  }, [wall, pageId, breakpoint.id]);

  return (
    <main className="flex h-full flex-col gap-6 overflow-auto bg-muted/30 p-6">
      <header className="shrink-0">
        <p className="text-sm text-muted-foreground">
          Development · {breakpoint.id} · {breakpoint.previewWidth}px
        </p>
        <h1 className="text-lg font-medium">{wall.page.title}</h1>
      </header>
      <div aria-label="New bricks" className="flex shrink-0 flex-wrap gap-2">
        {Object.values(modulesHash).map((module) => (
          <div key={module.id} className="flex items-center gap-2 border bg-background pl-3">
            <module.LineIcon aria-hidden="true" className="size-4" />
            <span className="text-sm">{module.label}</span>
            <WallModuleAction wallId={wall.id} moduleId={module.id} />
          </div>
        ))}
      </div>
      <div
        ref={wallRef}
        className="@container mx-auto flex min-h-80 shrink-0 grow flex-col bg-background"
        style={{ width: breakpoint.previewWidth }}
        role="region"
        aria-label={`${breakpoint.id} page preview`}
      >
        {sections.map((section) => (
          <section key={section.id} className="grid auto-cols-fr grid-flow-col">
            {section.stacks.map((stack) => (
              <div key={stack.id} data-dev-stack={stack.id} className="relative min-h-12 min-w-0">
                {stack.rows.map((row, index) => (
                  <div key={row.id} data-dev-row={row.id} className="relative min-h-12 min-w-0">
                    <div className="flex min-w-0 items-start overflow-x-auto">
                      {row.placements.map((placement) => {
                        const brick = placement.brick;
                        const module = modulesHash[brick.moduleId];
                        const Component = module.component;
                        return (
                          <div
                            key={placement.id}
                            className="min-w-0 flex-1"
                            style={{
                              minWidth: module.variants[placement.variantId].minWidth,
                            }}
                          >
                            <BrickWrapper className="h-auto">
                              <Component
                                state={brick.state}
                                variantId={placement.variantId}
                                spec={placement.spec}
                              />
                            </BrickWrapper>
                          </div>
                        );
                      })}
                    </div>
                    {dropTarget?.kind === "row" && dropTarget.rowId === row.id ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-blue-500"
                      />
                    ) : null}
                    {dropTarget?.kind === "stack" &&
                    dropTarget.stackId === stack.id &&
                    dropTarget.beforeRowId === (stack.rows[index + 1]?.id ?? null) ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 bg-blue-500"
                      />
                    ) : null}
                  </div>
                ))}
                {stack.rows.length === 0 ? (
                  <div
                    className={`flex min-h-12 items-center justify-center text-sm text-muted-foreground ${dropTarget?.kind === "stack" && dropTarget.stackId === stack.id ? "ring-2 ring-inset ring-blue-500" : ""}`}
                  >
                    Drop a brick to create a Row
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ))}
        <div
          data-dev-wall-bottom
          className={`flex min-h-80 w-full grow items-center justify-center border-2 border-dashed text-sm text-muted-foreground ${dropTarget?.kind === "wall" ? "border-blue-500 bg-blue-50" : "border-transparent"}`}
        >
          {stacks.some((stack) => stack.rows.some((row) => row.placements.length > 0))
            ? "Drop a new brick to create a Section"
            : "Drop your first brick here"}
        </div>
      </div>
    </main>
  );
}
