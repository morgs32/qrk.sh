import { swatchAndIconPreviewState } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconPreviewState";
import {
  SessionProvider,
  SessionReady,
  useLiveQuery,
  useMockAggregateSession,
  useSession,
} from "@zerospin/react";
import { prefixId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import type { IInferResource } from "@zerospin/core/models/types";
import { sessionRepoDbConfig } from "@zerospin/core/aggregateSession/sessionRepoDbConfig";
import { makeShapeCodecs } from "@zerospin/shapes";
import { Schema } from "effect";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Laptop, Monitor, MoveHorizontal, MoveVertical, Smartphone, Tablet } from "lucide-react";

import { Drawer } from "../modules/lib/Drawer";
import { ModuleFilmstrip } from "../modules/lib/ModuleFilmstrip";
import { ModulePreview } from "../modules/lib/ModulePreview";
import { SiteHeader } from "../app/[username]/site/[siteId]/SiteHeader";
import { BrowserChrome } from "../modules/lib/BrowserChrome";
import { WallEditor } from "../modules/lib/wall/WallEditor";
import { Button } from "../modules/components/ui/button";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../modules/lib/breakpoints";
import { makePlacementId } from "@qrk.sh/zerospin/src/modules/lib/makePlacementId";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { modulesHash } from "../modules/lib/modulesHash";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

const { user, site, page, wall, brick, placement } = userSessionDefinition.models;
const userId = prefixId(user, "story");
const siteId = prefixId(site, "story");
const pageId = prefixId(page, "story");
const claims = { aggregateId: "wall-story", clerkUserId: "wall-story" };

function makeResources(
  emptyWall: boolean,
  brickGap: number,
  stickyNavbar: boolean,
  borderWidth: number,
  cardStyle: boolean,
  fixture: "default" | "swatch-and-icon" | "article",
  crossRowFixture = false,
  sizingFixture = false,
  resizeFixture = false,
) {
  const timestamps = {
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    updatedAt: new Date("2026-10-20T00:00:00.000Z"),
  };
  const bricks: IInferResource<typeof brick>[] = emptyWall
    ? []
    : (crossRowFixture || resizeFixture
        ? [0, 1, 2, 3, 4]
        : sizingFixture
          ? [0, 1, 2, 3]
          : fixture === "default"
            ? [0, 1, 2]
            : [0]
      ).map((position) =>
        Schema.decodeUnknownSync(Schema.toType(brick.resourceJsonCodec))({
          ...timestamps,
          modelName: brick.modelName,
          version: brick.version,
          id: prefixId(brick, `story-${position}`),
          pageId,
          moduleId:
            ((crossRowFixture || resizeFixture) && position === 4) ||
            (sizingFixture && position === 3)
              ? "article"
              : fixture === "default"
                ? "swatch-and-icon"
                : fixture,
          borderWidth,
          stateRevision: 0,
          state:
            ((crossRowFixture || resizeFixture) && position === 4) ||
            (sizingFixture && position === 3)
              ? sizingFixture || resizeFixture
                ? {
                    title: "Content taller than its row minimum",
                    subtitle: "Natural height sizing fixture",
                    content: Array.from(
                      { length: 24 },
                      (_, index) =>
                        `Paragraph ${index + 1}: Natural content can grow beyond a saved row minimum without clipping or scrolling the brick.`,
                    ).join("\n\n"),
                  }
                : structuredClone(modulesHash.article.def.state)
              : fixture === "default"
                ? {
                    ...swatchAndIconPreviewState,
                    payload: {
                      hash: "",
                      color: ["#4A7C59", "#D4A373", "#577590", "#9D8ABF"][position],
                    },
                  }
                : structuredClone(modulesHash[fixture].def.state),
        }),
      );
  return {
    user: [
      Schema.decodeUnknownSync(Schema.toType(user.resourceJsonCodec))({
        ...timestamps,
        modelName: user.modelName,
        version: user.version,
        id: userId,
        clerkUserId: claims.clerkUserId,
        username: "story",
        displayName: "Storybook",
      }),
    ],
    site: [
      Schema.decodeUnknownSync(Schema.toType(site.resourceJsonCodec))({
        ...timestamps,
        modelName: site.modelName,
        version: site.version,
        id: siteId,
        userId,
        slug: "story",
        name: "Storybook",
        description: null,
        logoUrl: null,
        faviconLightUrl: null,
        faviconDarkUrl: null,
        isPublished: false,
        cardStyle,
        brickGap,
        stickyNavbar,
      }),
    ],
    page: [
      Schema.decodeUnknownSync(Schema.toType(page.resourceJsonCodec))({
        ...timestamps,
        modelName: page.modelName,
        version: page.version,
        id: pageId,
        siteId,
        slug: "story",
        title: "Wall editor",
        description: null,
        isPublished: false,
        publishedSnapshotId: null,
      }),
    ],
    wall: BREAKPOINTS.map(({ id }) =>
      Schema.decodeUnknownSync(Schema.toType(wall.resourceJsonCodec))({
        ...timestamps,
        modelName: wall.modelName,
        version: wall.version,
        id: prefixId(wall, `story-${id}`),
        pageId,
        breakpoint: id,
        layout: {
          sections: emptyWall
            ? []
            : crossRowFixture
              ? [
                  {
                    id: prefixId({ abbreviation: "sec" }, `story-${id}-source`),
                    stacks: [
                      {
                        id: prefixId({ abbreviation: "stk" }, `story-${id}-source`),
                        name: "Source stack",
                        rows: [
                          {
                            minHeight: null,
                            id: prefixId({ abbreviation: "row" }, `story-${id}-0`),
                            placementIds: bricks
                              .slice(0, 2)
                              .map((entry) => makePlacementId(entry.id, id)),
                          },
                          {
                            minHeight: null,
                            id: prefixId({ abbreviation: "row" }, `story-${id}-1`),
                            placementIds: [makePlacementId(bricks[2].id, id)],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: prefixId({ abbreviation: "sec" }, `story-${id}-destination`),
                    stacks: [
                      {
                        id: prefixId({ abbreviation: "stk" }, `story-${id}-destination`),
                        name: "Destination stack",
                        rows: [
                          {
                            minHeight: null,
                            id: prefixId({ abbreviation: "row" }, `story-${id}-2`),
                            placementIds: [makePlacementId(bricks[3].id, id)],
                          },
                          {
                            minHeight: null,
                            id: prefixId({ abbreviation: "row" }, `story-${id}-3`),
                            placementIds: [makePlacementId(bricks[4].id, id)],
                          },
                          {
                            minHeight: null,
                            id: prefixId({ abbreviation: "row" }, `story-${id}-empty`),
                            placementIds: [],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    id: prefixId({ abbreviation: "sec" }, `story-${id}-empty`),
                    stacks: [
                      {
                        id: prefixId({ abbreviation: "stk" }, `story-${id}-empty`),
                        name: "Empty stack",
                        rows: [],
                      },
                    ],
                  },
                ]
              : [
                  {
                    id: prefixId({ abbreviation: "sec" }, `story-${id}`),
                    stacks: [
                      {
                        id: prefixId({ abbreviation: "stk" }, `story-${id}`),
                        name: "Stack 1",
                        rows: (fixture === "default"
                          ? sizingFixture || resizeFixture
                            ? resizeFixture && id === "sm"
                              ? [0, 1, 2, 3]
                              : [0, 1, 2]
                            : [0, 1]
                          : [0]
                        ).map((position) => ({
                          minHeight:
                            sizingFixture || resizeFixture
                              ? position === 1
                                ? 360
                                : position === 2
                                  ? 90
                                  : null
                              : null,
                          id: prefixId({ abbreviation: "row" }, `story-${id}-${position}`),
                          placementIds: bricks
                            .filter(
                              (_, index) =>
                                (resizeFixture
                                  ? index < 3
                                    ? id === "sm" && index === 2
                                      ? 3
                                      : 0
                                    : index - 2
                                  : index < 2
                                    ? 0
                                    : sizingFixture
                                      ? index - 1
                                      : 1) === position,
                            )
                            .map((entry) => makePlacementId(entry.id, id)),
                        })),
                      },
                    ],
                  },
                ],
        },
      }),
    ),
    brick: bricks,
    placement: BREAKPOINTS.flatMap(({ id }) =>
      bricks.map((entry, index) =>
        Schema.decodeUnknownSync(Schema.toType(placement.resourceJsonCodec))({
          ...timestamps,
          modelName: placement.modelName,
          version: placement.version,
          id: makePlacementId(entry.id, id),
          brickId: entry.id,
          wallId: prefixId(wall, `story-${id}`),
          variantId: "default",
          widthWeight:
            sizingFixture && index === 0
              ? 480
              : modulesHash[entry.moduleId].variants.default.defaultWidth,
          specRevision: 0,
          generation: null,
          spec: modulesHash[entry.moduleId].variants.default.spec,
        }),
      ),
    ),
  };
}

/** Read the mounted mock session's journal rather than observing a mocked commit callback. */
function ResizeDiagnostics(props: { wallId: IInferResource<typeof wall>["id"] }) {
  const { wallId } = props;
  const session = useSession(userSessionDefinition);
  const [journal, setJournal] = useState("[]");
  const { data: currentWall } = useLiveQuery({
    session,
    key: wallId,
    query: (db, id) =>
      db.query.wall.findFirstOrThrow({
        where: { id: { eq: id } },
        with: { placements: true },
      }),
  });
  const rows = currentWall.layout.sections.flatMap((section) =>
    section.stacks.flatMap((stack) => stack.rows),
  );
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2 text-xs"
      data-testid="resize-diagnostics"
    >
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const state = session.store.getState();
          if (state.initialized === null) throw new Error("The story session is not initialized");
          setJournal(
            JSON.stringify(
              state.initialized.db
                .select()
                .from(sessionRepoDbConfig.schema.commands)
                .all()
                .filter(
                  ({ commandName }) =>
                    commandName === "setRowWidthWeights" || commandName === "setRowMinHeight",
                )
                .map(({ commandName, payload }) => ({
                  commandName,
                  payload:
                    commandName === "setRowWidthWeights"
                      ? Schema.decodeUnknownSync(
                          Schema.fromJsonString(
                            makeShapeCodecs(
                              userSessionDefinition.contracts.setRowWidthWeights.payload,
                            ).rowCodec,
                          ),
                        )(payload)
                      : Schema.decodeUnknownSync(
                          Schema.fromJsonString(
                            makeShapeCodecs(userSessionDefinition.contracts.setRowMinHeight.payload)
                              .rowCodec,
                          ),
                        )(payload),
                })),
            ),
          );
        }}
      >
        Read resize journal
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const row = rows[0];
          if (row === undefined) throw new Error("Missing first story Row");
          const result = stageAggregateSessionCommand({
            session,
            contractName: "setRowMinHeight",
            payload: { wallId, rowId: row.id, minHeight: row.minHeight === 191 ? 192 : 191 },
          });
          if (result._tag === "Failure") throw new Error(result.failure.message);
        }}
      >
        Change active Row sizing
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const row = rows[1];
          if (row === undefined) throw new Error("Missing sibling story Row");
          const result = stageAggregateSessionCommand({
            session,
            contractName: "setRowMinHeight",
            payload: { wallId, rowId: row.id, minHeight: row.minHeight === 201 ? 202 : 201 },
          });
          if (result._tag === "Failure") throw new Error(result.failure.message);
        }}
      >
        Change sibling Row sizing
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const first = rows[0];
          const second = rows[1];
          if (first === undefined || second === undefined || first.placementIds[0] === undefined)
            throw new Error("Missing membership fixtures");
          const result = stageAggregateSessionCommand({
            session,
            contractName: "movePlacementToRow",
            payload: {
              placementId: first.placementIds[0],
              rowId: second.id,
              beforePlacementId: null,
            },
          });
          if (result._tag === "Failure") throw new Error(result.failure.message);
        }}
      >
        Move active Row member
      </Button>
      <output className="sr-only" data-testid="resize-journal">
        {journal}
      </output>
      <output className="sr-only" data-testid="resize-canonical">
        {JSON.stringify({
          rows,
          placements: currentWall.placements.map(({ id, widthWeight }) => ({ id, widthWeight })),
        })}
      </output>
    </div>
  );
}

function WallEditorStory(props: {
  emptyWall: boolean;
  brickGap: number;
  stickyNavbar: boolean;
  borderWidth: number;
  cardStyle: boolean;
  verticalAtLg: boolean;
  fixture: "default" | "swatch-and-icon" | "article";
  selected: boolean;
  shadowFixture: boolean;
  crossRowFixture: boolean;
  sizingFixture: boolean;
  resizeFixture: boolean;
  fitToWidth: boolean;
}) {
  const {
    emptyWall,
    brickGap,
    stickyNavbar,
    borderWidth,
    cardStyle,
    verticalAtLg,
    fixture,
    selected,
    shadowFixture,
    crossRowFixture,
    sizingFixture,
    resizeFixture,
    fitToWidth,
  } = props;
  const [shadowVisible, setShadowVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(true);
  const [resources] = useState(() =>
    makeResources(
      emptyWall,
      brickGap,
      stickyNavbar,
      borderWidth,
      cardStyle,
      shadowFixture ? "swatch-and-icon" : fixture,
      crossRowFixture,
      sizingFixture,
      resizeFixture,
    ),
  );
  const [selectedBrickId, setSelectedBrickId] = useState<string | null>(() =>
    selected ? (resources.brick[0]?.id ?? null) : null,
  );
  const [requestedBreakpoint, setRequestedBreakpoint] = useState<(typeof BREAKPOINTS)[number]>(
    BREAKPOINTS[0],
  );
  const [preview, setPreview] = useState({
    breakpoint: requestedBreakpoint,
    inlineEditingAvailable: !fitToWidth,
  });
  const { breakpoint, inlineEditingAvailable } = preview;
  const [availableWidth, setAvailableWidth] = useState(0);
  const observePreviewWidth = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const brickFlushes = useRef(new Map<string, (onRecover?: () => void) => boolean>());
  const registerBrickFlush = useCallback(
    (brickId: string, flush: (onRecover?: () => void) => boolean) => {
      const registered = brickFlushes.current;
      registered.set(brickId, flush);
      return () => {
        if (registered.get(brickId) === flush) registered.delete(brickId);
      };
    },
    [],
  );
  const flushBrick = useCallback(
    (brickId: string) => brickFlushes.current.get(brickId)?.() ?? true,
    [],
  );
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const retryPreview = useCallback(() => setRecoveryAttempt((attempt) => attempt + 1), []);
  const requestedInlineEditing =
    !fitToWidth || availableWidth >= requestedBreakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH;
  useLayoutEffect(() => {
    if (breakpoint === requestedBreakpoint && inlineEditingAvailable === requestedInlineEditing)
      return;
    // Keep the full-size editor mounted until its draft can leave this preview.
    if (inlineEditingAvailable) {
      let ready = true;
      for (const flush of brickFlushes.current.values()) {
        if (!flush(retryPreview)) ready = false;
      }
      if (!ready) return;
    }
    setPreview({
      breakpoint: requestedBreakpoint,
      inlineEditingAvailable: requestedInlineEditing,
    });
  }, [
    breakpoint,
    inlineEditingAvailable,
    recoveryAttempt,
    requestedBreakpoint,
    requestedInlineEditing,
    retryPreview,
  ]);

  const wallId = prefixId(wall, `story-${breakpoint.id}`);
  const frameWidth = breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH;
  const previewStyle = {
    "--wall-preview-width": `${breakpoint.previewWidth}px`,
    "--wall-preview-border-width": `${PREVIEW_BORDER_WIDTH}px`,
    minWidth: frameWidth,
    ...(fitToWidth
      ? {
          width: frameWidth,
          marginInline: "auto",
          zoom: inlineEditingAvailable ? 1 : Math.min(1, availableWidth / frameWidth),
        }
      : { minHeight: "100%" }),
  };

  const session = useMockAggregateSession(userSessionDefinition, { claims, resources });
  return (
    <SessionProvider session={session}>
      <SessionReady
        definition={userSessionDefinition}
        fallback={<p role="status">Opening local session…</p>}
        renderError={(error, retry) => (
          <div role="alert">
            {error.message}
            <Button type="button" variant="outline" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
      >
        <div
          ref={(element) => {
            if (element === null) return;
            const observer = new MutationObserver(() => {
              setShadowVisible(element.querySelector(".wall-shadow-placeholder") !== null);
            });
            observer.observe(element, { childList: true, subtree: true });
            return () => observer.disconnect();
          }}
          className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900 antialiased"
        >
          <header
            className={`flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white ${fitToWidth ? "min-h-14 flex-wrap gap-2 px-3 py-2" : "h-14 gap-4 px-6"}`}
          >
            <h1 className="text-sm font-medium tracking-tight">Wall editor</h1>
            {!fitToWidth && fixture !== "default" && resources.brick.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedBrickId !== null}
                  onChange={(event) =>
                    setSelectedBrickId(event.target.checked ? resources.brick[0].id : null)
                  }
                />
                Selected placement
              </label>
            ) : null}
            <div
              aria-label="Preview breakpoint"
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
            >
              {BREAKPOINTS.map((entry) => {
                const Icon = { sm: Smartphone, md: Tablet, lg: Laptop, xl: Monitor }[entry.id];
                return (
                  <Button
                    key={entry.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${entry.id} preview, ${entry.previewWidth}px`}
                    aria-pressed={entry.id === breakpoint.id}
                    onClick={() => setRequestedBreakpoint(entry)}
                    className={`h-7 gap-2 rounded-md px-2.5 text-xs tabular-nums ${entry.id === breakpoint.id ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500"}`}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    <span>{entry.previewWidth}</span>
                  </Button>
                );
              })}
            </div>
          </header>
          <div className={`flex min-h-0 flex-1 flex-col ${verticalAtLg ? "lg:flex-row" : ""}`}>
            <main
              ref={fitToWidth ? observePreviewWidth : undefined}
              className={`min-h-0 min-w-0 flex-1 overflow-auto px-8 py-6 ${fitToWidth ? "wall-preview-scroll" : ""}`}
              aria-label={fitToWidth ? `${breakpoint.id} page preview` : undefined}
            >
              {resizeFixture ? (
                <>
                  <ResizeDiagnostics wallId={wallId} />
                  <Button
                    className="mb-3"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditorVisible((visible) => !visible)}
                  >
                    {editorVisible ? "Unmount Wall editor" : "Mount Wall editor"}
                  </Button>
                </>
              ) : null}
              {fixture !== "default" ? (
                <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-600">
                  <p>
                    {resources.brick.length > 0
                      ? `Existing placement — ${shadowFixture ? "Swatch and Icon" : modulesHash[fixture].label}`
                      : "Existing placement absent — empty Wall"}
                  </p>
                  <p role="status" data-testid="shadow-status">
                    {shadowVisible
                      ? `Insertion shadow — ${modulesHash[fixture].label}`
                      : "Shadow absent — not dragging or cancelled"}
                  </p>
                </div>
              ) : null}
              <div
                className={`wall-preview-frame relative isolate flex w-full flex-col ${fitToWidth && availableWidth === 0 && !inlineEditingAvailable ? "invisible" : ""}`}
                style={previewStyle}
                data-breakpoint={breakpoint.id}
              >
                <BrowserChrome breakpoint={breakpoint.id} />
                <div
                  role="region"
                  aria-label={`${breakpoint.id} page preview`}
                  className="flex flex-1 flex-col"
                >
                  <SiteHeader siteId={siteId} />
                  {editorVisible ? (
                    <WallEditor
                      key={wallId}
                      wallId={wallId}
                      fitToWidth={fitToWidth}
                      inlineEditingAvailable={inlineEditingAvailable}
                      selectedBrickId={selectedBrickId}
                      onEditBrick={setSelectedBrickId}
                      registerBrickFlush={registerBrickFlush}
                      flushBrick={flushBrick}
                    />
                  ) : null}
                </div>
              </div>
            </main>
            <div
              className={
                fitToWidth
                  ? "hidden"
                  : `h-[280px] min-w-0 shrink-0 ${verticalAtLg ? "lg:h-full lg:w-[420px]" : ""}`
              }
            >
              <Drawer
                side="bottom"
                layoutMode="flow"
                animated={false}
                aria-label="Bricks drawer"
                className={verticalAtLg ? "lg:border-t-0 lg:border-l" : undefined}
              >
                <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
                  <div className="flex items-baseline gap-3">
                    <p className="text-xs text-zinc-500">
                      {fixture === "default"
                        ? "Drag a brick onto your page"
                        : `Source preview — ${modulesHash[fixture].label}`}
                    </p>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-zinc-400">
                    <MoveHorizontal
                      className={`size-3.5 ${verticalAtLg ? "lg:hidden" : ""}`}
                      aria-hidden="true"
                    />
                    {verticalAtLg ? (
                      <MoveVertical className="hidden size-3.5 lg:block" aria-hidden="true" />
                    ) : null}
                    Scroll to browse
                  </span>
                </header>
                <div className="min-h-0 flex-1">
                  {fixture === "default" ? (
                    <ModuleFilmstrip
                      verticalAtLg={verticalAtLg}
                      breakpoint={breakpoint.id}
                      cardStyle={cardStyle}
                    />
                  ) : (
                    <ModulePreview
                      brickModule={modulesHash[fixture]}
                      breakpoint={breakpoint.id}
                      cardStyle={cardStyle}
                      moduleAction={() => (
                        <Button
                          type="button"
                          aria-label="Preview brick action"
                          onClick={() => setSelectedBrickId(null)}
                        >
                          Clear selection
                        </Button>
                      )}
                    />
                  )}
                </div>
              </Drawer>
            </div>
          </div>
        </div>
      </SessionReady>
    </SessionProvider>
  );
}

const meta = {
  title: "Studio/WallEditor.tsx",
  id: "app-studio-wall-editor",
  parameters: { layout: "fullscreen" },
  args: {
    emptyWall: false,
    brickGap: 0,
    stickyNavbar: true,
    borderWidth: 0,
    cardStyle: false,
    verticalAtLg: false,
    fixture: "default",
    selected: false,
  },
  argTypes: {
    stickyNavbar: { control: "boolean" },
    brickGap: { control: { type: "range", min: 0, max: 12, step: 1 } },
    borderWidth: { control: { type: "range", min: 0, max: 12, step: 1 } },
    cardStyle: { control: "boolean" },
    fixture: { control: "select", options: ["default", "swatch-and-icon", "article"] },
    selected: { control: "boolean" },
  },
  render: function Render(
    props: {
      emptyWall: boolean;
      brickGap: number;
      stickyNavbar: boolean;
      borderWidth: number;
      cardStyle: boolean;
      verticalAtLg: boolean;
      fixture: "default" | "swatch-and-icon" | "article";
      selected: boolean;
    },
    context,
  ) {
    const {
      emptyWall,
      brickGap,
      stickyNavbar,
      borderWidth,
      cardStyle,
      verticalAtLg,
      fixture,
      selected,
    } = props;
    const shadowFixture = context.id.includes("--shadow-brick");
    const fitToWidth = context.id.endsWith("--fit-to-width");
    const crossRowFixture =
      context.id.includes("--cross-row-") || (fitToWidth && fixture === "default");
    const sizingFixture = context.id.includes("--sizing-foundation");
    const resizeFixture = context.id.includes("--pointer-resize");
    const populatedFixture =
      context.id.endsWith("--preview-brick") || context.id.endsWith("--placement-brick");
    return (
      <WallEditorStory
        key={`${emptyWall}-${brickGap}-${stickyNavbar}-${borderWidth}-${cardStyle}-${fixture}-${selected}-${shadowFixture}-${crossRowFixture}-${sizingFixture}-${resizeFixture}`}
        emptyWall={populatedFixture ? false : emptyWall}
        brickGap={brickGap}
        stickyNavbar={stickyNavbar}
        borderWidth={borderWidth}
        cardStyle={cardStyle}
        verticalAtLg={verticalAtLg}
        fixture={fixture}
        selected={selected}
        shadowFixture={shadowFixture}
        crossRowFixture={crossRowFixture}
        sizingFixture={sizingFixture}
        resizeFixture={resizeFixture}
        fitToWidth={fitToWidth}
      />
    );
  },
} satisfies Meta<{
  emptyWall: boolean;
  brickGap: number;
  stickyNavbar: boolean;
  borderWidth: number;
  cardStyle: boolean;
  verticalAtLg: boolean;
  fixture: "default" | "swatch-and-icon" | "article";
  selected: boolean;
}>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
export const FitToWidth: StoryObj<typeof meta> = {};
export const EmptyWall: StoryObj<typeof meta> = { args: { emptyWall: true } };

/** No capture stubs or synthetic play: use this fixture for native mouse, pen, and touch input. */
export const PointerResizeNative: StoryObj<typeof meta> = {
  args: { brickGap: 12, cardStyle: true },
};

/** Storybook-only experiment: a 420px right catalog at lg, and the existing bottom drawer below. */
export const VerticalDrawer: StoryObj<typeof meta> = {
  args: { verticalAtLg: true },
  parameters: {
    docs: {
      description: {
        story:
          "At viewport widths of 1024px and above, the catalog occupies a 420px right column with one vertical scroll area. Below that width it uses the existing 280px bottom drawer. Placement follows the viewport, independently of the selected page-preview breakpoint. Use emptyWall to try dragging into an empty page.",
      },
    },
  },
};
