import {
  makeId,
  makeIdSchema,
  stageAggregateSessionCommand,
  validateAggregateSessionCommand,
} from "@zerospin/sdk/browser";
import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
  type ElementEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { announce, cleanup } from "@atlaskit/pragmatic-drag-and-drop-live-region";
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { DropIndicator } from "@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/list-item";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { Button } from "../modules/components/ui/button";
import { BrickWrapper } from "../modules/components/brick/BrickWrapper";
import { BREAKPOINTS } from "../modules/lib/breakpoints";
import { modulesHash } from "../modules/lib/modulesHash";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { canShareRow } from "@qrk.sh/zerospin/src/modules/lib/canShareRow";
import { makeWallLayoutView } from "../modules/lib/wall/makeWallLayoutView";
import { WallModuleAction } from "../modules/lib/wall/WallModuleAction";
import {
  stackMoveTargetSchema,
  wallInsertionTargetSchema,
} from "@qrk.sh/zerospin/src/aggregates/user/layout/wallTargetSchemas";
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
  const [dropTarget, setDropTarget] = useState<
    typeof wallInsertionTargetSchema.Type | typeof stackMoveTargetSchema.Type | null
  >(null);
  const [stackIndicator, setStackIndicator] = useState<{
    element: Element;
    instruction: Instruction;
  } | null>(null);
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
    incomingVariant: { minWidth: number; defaultHeight: number | null };
    movingPlacementId?: string;
    zone: typeof wallInsertionTargetSchema.Type;
    rowWidth: number;
  }): typeof wallInsertionTargetSchema.Type | null {
    const { incomingVariant, movingPlacementId, zone, rowWidth } = props;
    if (zone.wallId !== wall.id) return null;

    // 1. A hovered Row either accepts sharing or inserts immediately below itself.
    if (zone.kind === "row") {
      const stack = stacks.find((entry) => entry.rows.some((row) => row.id === zone.rowId));
      const row = stack?.rows.find((entry) => entry.id === zone.rowId);
      if (stack === undefined || row === undefined) return null;
      if (row.placements.length === 1 && row.placements[0].id === movingPlacementId) return null;
      const existingVariants = row.placements
        .filter((entry) => entry.id !== movingPlacementId)
        .map((entry) => modulesHash[entry.brick.moduleId].variants[entry.variantId]);
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
  const resolveCurrentDrop = useEffectEvent((event: ElementEventBasePayload) => {
    const { source, location } = event;
    const hovered = location.current.dropTargets[0];
    if (source.data.wallId !== wall.id || hovered === undefined) return null;

    // Whole Stacks use the existing contract for capacity, ownership, and pruning checks.
    if (source.data.kind === "stack") {
      const sourceSection = sections.find((section) =>
        section.stacks.some((stack) => stack.id === source.data.id),
      );
      const movingStack = sourceSection?.stacks.find((stack) => stack.id === source.data.id);
      if (
        sourceSection === undefined ||
        movingStack === undefined ||
        !movingStack.rows.some((row) => row.placements.length > 0)
      )
        return null;
      const decoded = Schema.decodeUnknownResult(stackMoveTargetSchema)(hovered.data);
      if (Result.isFailure(decoded)) return null;
      const target = decoded.success;
      if (
        target.kind === "section" &&
        target.sectionId === sourceSection.id &&
        (target.beforeStackId === movingStack.id ||
          target.beforeStackId ===
            (sourceSection.stacks[sourceSection.stacks.indexOf(movingStack) + 1]?.id ?? null))
      )
        return null;
      const validation = validateAggregateSessionCommand({
        session,
        contractName: "moveStack",
        payload: { id: movingStack.id, stackId: movingStack.id, target },
      });
      if (validation._tag === "Failure") return null;
      return {
        stackMove: {
          stackId: movingStack.id,
          target,
          element: hovered.element,
          instruction: extractInstruction(hovered.data),
        },
      };
    }
    if (source.data.kind !== "wall-module" && source.data.kind !== "placement") return null;
    const moving =
      source.data.kind === "placement"
        ? wall.placements.find((placement) => placement.id === source.data.id)
        : undefined;
    if (source.data.kind === "placement" && moving === undefined) return null;
    const moduleId =
      moving?.brick.moduleId ??
      Object.values(modulesHash).find((module) => module.id === source.data.moduleId)?.id;
    if (moduleId === undefined) return null;
    const zone = Schema.decodeUnknownResult(wallInsertionTargetSchema)(hovered.data);
    if (Result.isFailure(zone)) return null;
    const target = resolveBrickDrop({
      incomingVariant:
        moving === undefined
          ? modulesHash[moduleId].variants.default
          : modulesHash[moduleId].variants[moving.variantId],
      movingPlacementId: moving?.id,
      zone: zone.success,
      rowWidth: hovered.element.getBoundingClientRect().width,
    });
    if (target === null) return null;

    // Preserve the current Row when appending or inserting would leave the Brick in place.
    if (moving !== undefined) {
      const sourceStack = stacks.find((stack) =>
        stack.rows.some((row) => row.placements.some((placement) => placement.id === moving.id)),
      );
      const sourceRow = sourceStack?.rows.find((row) =>
        row.placements.some((placement) => placement.id === moving.id),
      );
      if (sourceStack === undefined || sourceRow === undefined) return null;
      if (
        target.kind === "row" &&
        target.rowId === sourceRow.id &&
        sourceRow.placements.at(-1)?.id === moving.id
      )
        return null;
      if (
        target.kind === "stack" &&
        target.stackId === sourceStack.id &&
        sourceRow.placements.length === 1 &&
        (target.beforeRowId === sourceRow.id ||
          target.beforeRowId ===
            (sourceStack.rows[sourceStack.rows.indexOf(sourceRow) + 1]?.id ?? null))
      )
        return null;
    }
    return { brickDrop: { moduleId, moving, target } };
  });

  const submitDrop = useEffectEvent((event: ElementEventBasePayload) => {
    const resolved = resolveCurrentDrop(event);
    setDropTarget(null);
    setStackIndicator(null);
    if (resolved === null) return;
    if (resolved.stackMove !== undefined) {
      const { stackId, target } = resolved.stackMove;
      const result = stageAggregateSessionCommand({
        session,
        contractName: "moveStack",
        payload: { id: crypto.randomUUID(), stackId, target },
      });
      if (result._tag === "Success") announce("Stack moved in this Wall.");
      return;
    }
    const { moduleId, moving, target } = resolved.brickDrop;
    if (moving !== undefined) {
      const result = stageAggregateSessionCommand({
        session,
        contractName: "movePlacement",
        payload: {
          id: crypto.randomUUID(),
          placementId: moving.id,
          target,
        },
      });
      if (result._tag === "Success") announce("Brick moved in this Wall.");
      return;
    }
    const id = session.runSync(makeId(brickV1));
    const result = stageAggregateSessionCommand({
      session,
      contractName: "addBrick",
      payload: { id, pageId, moduleId, target },
    });
    if (result._tag === "Success") announce("Brick added to this Wall.");
  });

  useEffect(() => cleanup, []);
  useEffect(() => {
    const root = wallRef.current;
    if (root === null) return;
    const disposers: (() => void)[] = [];
    const accepts = (data: Record<string | symbol, unknown>) =>
      data.wallId === wall.id &&
      (data.kind === "wall-module"
        ? Object.values(modulesHash).some((module) => module.id === data.moduleId)
        : data.kind === "stack"
          ? stacks.some(
              (stack) =>
                stack.id === data.id && stack.rows.some((row) => row.placements.length > 0),
            )
          : data.kind === "placement" &&
            wall.placements.some((placement) => placement.id === data.id));

    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-dev-placement], [data-dev-stack]",
    )) {
      const kind = element.hasAttribute("data-dev-stack") ? "stack" : "placement";
      const id = kind === "stack" ? element.dataset.devStack : element.dataset.devPlacement;
      const grip = element.querySelector<HTMLButtonElement>(
        kind === "stack" ? "[data-stack-grip]" : "[data-placement-grip]",
      );
      if (id === undefined || grip === null) continue;
      disposers.push(
        draggable({
          element,
          dragHandle: grip,
          getInitialData: () => ({ kind, id, wallId: wall.id }),
        }),
      );
    }

    // DOM registrations follow saved layout changes, never transient highlighting.
    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-dev-row], [data-dev-stack], [data-dev-section], [data-dev-wall-bottom]",
    )) {
      disposers.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) =>
            accepts(source.data) &&
            (element.hasAttribute("data-dev-section")
              ? source.data.kind === "stack"
              : !element.hasAttribute("data-dev-row") || source.data.kind !== "stack"),
          getData: ({ source, input }) => {
            if (source.data.kind === "stack" && element.dataset.devStack !== undefined) {
              const section = sections.find((entry) =>
                entry.stacks.some((stack) => stack.id === element.dataset.devStack),
              );
              const stack = section?.stacks.find((entry) => entry.id === element.dataset.devStack);
              if (section === undefined || stack === undefined) return {};
              const data = attachInstruction(
                {},
                {
                  element,
                  input,
                  axis: "horizontal",
                  operations: { "reorder-before": "available", "reorder-after": "available" },
                },
              );
              return {
                ...data,
                wallId: wall.id,
                kind: "section",
                sectionId: section.id,
                beforeStackId:
                  extractInstruction(data)?.operation === "reorder-before"
                    ? stack.id
                    : (section.stacks
                        .slice(section.stacks.indexOf(stack) + 1)
                        .find((entry) => entry.id !== source.data.id)?.id ?? null),
              };
            }
            if (element.dataset.devSection !== undefined) {
              return {
                wallId: wall.id,
                kind: "section",
                sectionId: element.dataset.devSection,
                beforeStackId: null,
              };
            }
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
    const showDestination = (event: ElementEventBasePayload) => {
      const resolved = resolveCurrentDrop(event);
      const stackMove = resolved?.stackMove;
      setDropTarget(stackMove?.target ?? resolved?.brickDrop?.target ?? null);
      setStackIndicator(
        stackMove?.instruction
          ? { element: stackMove.element, instruction: stackMove.instruction }
          : null,
      );
    };
    disposers.push(
      monitorForElements({
        canMonitor: ({ source }) => accepts(source.data),
        onDragStart: (event) => {
          root.dataset.dragging = "true";
          showDestination(event);
        },
        onDrag: showDestination,
        onDropTargetChange: showDestination,
        onDrop: (event) => {
          delete root.dataset.dragging;
          submitDrop(event);
        },
      }),
    );
    return combine(...disposers, () => {
      delete root.dataset.dragging;
      setDropTarget(null);
      setStackIndicator(null);
    });
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
        className="group/dev-wall @container mx-auto flex min-h-80 shrink-0 grow flex-col bg-background"
        style={{ width: breakpoint.previewWidth }}
        role="region"
        aria-label={`${breakpoint.id} page preview`}
      >
        {sections.map((section) => (
          <section
            key={section.id}
            data-dev-section={section.id}
            className={`relative grid auto-cols-fr grid-flow-col ${dropTarget?.kind === "section" && dropTarget.sectionId === section.id && stackIndicator === null ? "ring-2 ring-inset ring-blue-500" : ""}`}
          >
            {section.stacks.map((stack) => (
              <div
                key={stack.id}
                data-dev-stack={stack.id}
                className="group/dev-stack relative min-h-12 min-w-0"
              >
                {stack.rows.some((row) => row.placements.length > 0) ? (
                  <div className="absolute left-0 top-0 z-30 flex h-7 max-w-[calc(100%-3.5rem)] items-center gap-1 bg-background/95 text-xs text-muted-foreground opacity-0 transition-opacity group-hover/dev-stack:opacity-100 group-focus-within/dev-stack:opacity-100 group-data-[dragging=true]/dev-wall:pointer-events-none group-data-[dragging=true]/dev-wall:invisible motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Drag Stack ${stack.id}`}
                      data-stack-grip
                      className="size-7 cursor-grab rounded-none p-0 active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" aria-hidden="true" />
                    </Button>
                    <span className="min-w-0 truncate">{stack.name}</span>
                  </div>
                ) : null}
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
                            data-dev-placement={placement.id}
                            className="group/dev-placement relative min-w-0 flex-1"
                            style={{
                              minWidth: module.variants[placement.variantId].minWidth,
                            }}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              aria-label={`Drag Brick ${brick.id}`}
                              data-placement-grip
                              className="absolute right-0 top-0 z-20 size-7 cursor-grab rounded-none bg-background/95 p-0 opacity-0 shadow-sm transition-opacity hover:bg-background group-hover/dev-placement:opacity-100 group-focus-within/dev-placement:opacity-100 active:cursor-grabbing motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100"
                            >
                              <GripVertical className="size-4" aria-hidden="true" />
                            </Button>
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
            ? "Drop a Brick or Stack to create a Section"
            : "Drop your first brick here"}
        </div>
      </div>
      {stackIndicator &&
        createPortal(
          <DropIndicator instruction={stackIndicator.instruction} />,
          stackIndicator.element,
        )}
    </main>
  );
}
