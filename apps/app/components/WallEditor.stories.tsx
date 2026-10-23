import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { MockAggregateInitializer, useLiveQuery } from "@zerospin/react";
import { makeIdSchema, prefixId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { useCallback, useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { isNonEmptySpec } from "@json-render/core";
import { BrowserChrome } from "../modules/lib/BrowserChrome";
import { WallTree } from "../modules/lib/wall/WallTree";
import { makeWallLayoutView } from "../modules/lib/wall/makeWallLayoutView";
import { BrickWrapper } from "../modules/components/brick/BrickWrapper";
import { BREAKPOINTS } from "../modules/lib/breakpoints";
import { makePlacementId } from "@qrk.sh/zerospin/src/modules/lib/makePlacementId";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { modulesHash } from "../modules/lib/modulesHash";
import { UserUI } from "@/zerospin/UserUI";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { BrickDetail } from "@/app/[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail";

const { user, site, page, wall, brick, placement } = userSessionDefinition.models;
const userId = prefixId(user, "story");
const siteId = prefixId(site, "story");
const pageId = prefixId(page, "story");
const claims = { aggregateId: "wall-story", clerkUserId: "wall-story" };

function makeResources(emptyWall: boolean) {
  const timestamps = {
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    updatedAt: new Date("2026-10-20T00:00:00.000Z"),
  };
  const bricks = emptyWall
    ? []
    : [0, 1, 2].map((position) =>
        Schema.decodeUnknownSync(Schema.toType(brick.resourceJsonCodec))({
          ...timestamps,
          modelName: brick.modelName,
          version: brick.version,
          id: prefixId(brick, `story-${position}`),
          pageId,
          moduleId: "swatch-and-icon",
          stateRevision: 0,
          state: {
            ...swatchAndIconV1.defaultState,
            payload: { hash: "", color: ["#4A7C59", "#D4A373", "#577590"][position] },
          },
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
        cardStyle: false,
        stickyNavbar: true,
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
            : [
                {
                  id: prefixId({ abbreviation: "sec" }, `story-${id}`),
                  stacks: [
                    {
                      id: prefixId({ abbreviation: "stk" }, `story-${id}`),
                      name: "Stack 1",
                      rows: [0, 1, 2].map((position) => ({
                        id: prefixId({ abbreviation: "row" }, `story-${id}-${position}`),
                        placementIds: bricks
                          .filter((_, index) => (index < 2 ? 0 : 1) === position)
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
      bricks.map((entry) =>
        Schema.decodeUnknownSync(Schema.toType(placement.resourceJsonCodec))({
          ...timestamps,
          modelName: placement.modelName,
          version: placement.version,
          id: makePlacementId(entry.id, id),
          brickId: entry.id,
          wallId: prefixId(wall, `story-${id}`),
          variantId: "default",
          specRevision: 0,
          generation: null,
          spec: modulesHash["swatch-and-icon"].variants.default.spec,
        }),
      ),
    ),
  };
}

function WallStoryPage() {
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const regionRef = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return;
    setAvailableWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setAvailableWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={regionRef} className="w-full">
      <WallStoryContent availableWidth={availableWidth} />
    </div>
  );
}

function WallStoryContent(props: { availableWidth: number | null }) {
  const { availableWidth } = props;
  const session = UserUI.useSession();
  const { data: siteRow } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const { brickId: selectedBrickId } = useParams({ strict: false });
  const navigate = useNavigate();
  const breakpoint = BREAKPOINTS.find((entry) => entry.id === search.breakpoint);
  const { data: walls } = useLiveQuery({
    session,
    key: pageId,
    query: (db, id) =>
      db.query.wall.findMany({
        where: { pageId: { eq: id } },
        with: { placements: { with: { brick: true } } },
      }),
  });
  const activeWall = walls.find((entry) => entry.breakpoint === breakpoint?.id);
  const canEdit =
    availableWidth !== null &&
    breakpoint !== undefined &&
    breakpoint.previewWidth <= availableWidth;
  useEffect(() => {
    if (availableWidth === null) return;
    const largestFitting = BREAKPOINTS.filter((entry) => entry.previewWidth <= availableWidth).at(
      -1,
    );
    if (largestFitting === undefined) return;
    if (breakpoint !== undefined && breakpoint.previewWidth <= availableWidth) return;
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        breakpoint: largestFitting.id,
        insertion: undefined,
      }),
    });
  }, [availableWidth, breakpoint, navigate]);
  if (siteRow === undefined) return <p role="alert">The Storybook Site fixture is missing.</p>;

  function editBrick(brickId: string) {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId/brick/$brickId",
      params: { username: "story", siteId, pageId, brickId },
      search: { breakpoint: search.breakpoint },
      resetScroll: false,
    });
  }

  const sections =
    activeWall === undefined ? [] : makeWallLayoutView({ wall: activeWall }).sections;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Real local session · the app's queries, commands, and editing form.
      </p>
      <div className="min-h-64 border bg-background">
        {availableWidth === null ? (
          <p>Measuring preview…</p>
        ) : availableWidth < BREAKPOINTS[0].previewWidth ? (
          <p>At least 360px is needed.</p>
        ) : breakpoint === undefined || !canEdit ? (
          <p>Choosing a fitting breakpoint…</p>
        ) : activeWall === undefined ? (
          <p role="status">This page's wall is unavailable.</p>
        ) : (
          <WallTree
            breakpoint={breakpoint.id}
            selectedBrickId={selectedBrickId}
            sections={sections.map((section) => ({
              id: section.id,
              stacks: section.stacks.map((stack) => ({
                id: stack.id,
                name: stack.name,
                rows: stack.rows.map((row) => ({
                  id: row.id,
                  placements: row.placements.map((placement) => {
                    const brick = placement.brick;
                    const module = modulesHash[brick.moduleId];
                    const Component = module.component;
                    return {
                      id: placement.id,
                      brickId: brick.id,
                      minWidth: module.variants[placement.variantId].minWidth,
                      content:
                        brick.state === null || isNonEmptySpec(placement.spec) ? (
                          <div
                            className={`brick-surface ${siteRow.cardStyle ? "brick-surface-card" : "brick-surface-flat"} brick-hover-target relative min-w-0`}
                          >
                            <BrickWrapper className="brick-hover-surface h-auto w-full min-w-0">
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
                    };
                  }),
                })),
              })),
            }))}
            onEditBrick={editBrick}
            onDeleteBrick={(id) => {
              const brickId = Schema.decodeUnknownSync(makeIdSchema(brick))(id);
              const result = stageAggregateSessionCommand({
                session,
                contractName: "deleteBrick",
                payload: { brickId },
              });
              if (result._tag === "Success" && selectedBrickId === brickId) {
                void navigate({
                  to: "/$username/site/$siteId/page/$pageId",
                  params: { username: "story", siteId, pageId },
                  search: { breakpoint: search.breakpoint },
                  resetScroll: false,
                });
              }
              return result._tag === "Success";
            }}
          />
        )}
      </div>
      <button
        type="button"
        className="text-sm underline"
        onClick={() => {
          void navigate({
            to: "/$username/site/$siteId/page/$pageId",
            params: { username: "story", siteId, pageId },
            search: { breakpoint: search.breakpoint },
            resetScroll: false,
          });
        }}
      >
        Close brick form
      </button>
      <Outlet />
    </div>
  );
}

function WallEditorStory(props: { width: number; rowHeight: number; emptyWall: boolean }) {
  const { width, rowHeight, emptyWall } = props;
  const [resources] = useState(() => makeResources(emptyWall));
  const [router] = useState(() => {
    const root = createRootRoute();
    const editor = createRoute({
      getParentRoute: () => root,
      path: "/$username/site/$siteId/page/$pageId",
      validateSearch: (
        search: Record<string, unknown>,
      ): { breakpoint?: string; insertion?: string } => ({
        breakpoint: typeof search.breakpoint === "string" ? search.breakpoint : undefined,
        insertion: typeof search.insertion === "string" ? search.insertion : undefined,
      }),
      component: WallStoryPage,
    });
    const detail = createRoute({
      getParentRoute: () => editor,
      path: "brick/$brickId",
      component: BrickDetail,
    });
    const initialBreakpoint = BREAKPOINTS.filter((entry) => entry.previewWidth <= width).at(-1);
    return createRouter({
      routeTree: root.addChildren([editor.addChildren([detail])]),
      history: createMemoryHistory({
        initialEntries: [
          `/story/site/${siteId}/page/${pageId}${
            initialBreakpoint === undefined ? "" : `?breakpoint=${initialBreakpoint.id}`
          }`,
        ],
      }),
    });
  });
  return (
    <div className="wall-story" style={{ width }}>
      <style>{`.wall-story .wall-placement { min-height: ${rowHeight}px; }`}</style>
      <MockAggregateInitializer
        definition={userSessionDefinition}
        claims={claims}
        resources={resources}
        renderError={(error, retry) => (
          <div role="alert">
            {error.message}
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )}
      >
        {({ session, isLoaded }) =>
          isLoaded ? (
            <UserUI session={session}>
              <RouterProvider router={router} />
            </UserUI>
          ) : (
            <p role="status">Opening local session…</p>
          )
        }
      </MockAggregateInitializer>
    </div>
  );
}

const meta = {
  title: "App/Studio/Wall Editor",
  parameters: {
    layout: "centered",
    docs: {
      source: {
        type: "code",
        code: "<MockAggregateInitializer definition={userSessionDefinition} claims={claims} resources={resources}>…</MockAggregateInitializer>",
      },
    },
  },
  args: { width: 480, rowHeight: 40, emptyWall: false },
  argTypes: {
    width: { control: { type: "range", min: 360, max: 1600, step: 20 } },
    rowHeight: { control: { type: "range", min: 28, max: 56, step: 4 } },
  },
  render: function Render(props: { width: number; rowHeight: number; emptyWall: boolean }) {
    const { width, rowHeight, emptyWall } = props;
    return (
      <WallEditorStory
        key={String(emptyWall)}
        width={width}
        rowHeight={rowHeight}
        emptyWall={emptyWall}
      />
    );
  },
} satisfies Meta<{ width: number; rowHeight: number; emptyWall: boolean }>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
export const EmptyWall: StoryObj<typeof meta> = { args: { emptyWall: true } };

export const ZoomedOut: StoryObj<typeof meta> = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="grid min-h-dvh place-items-center overflow-auto bg-muted/30 p-8 [--wall-frame-height:640px]">
        <TransformWrapper disabled initialScale={0.5} minScale={0.5} maxScale={0.5}>
          <TransformComponent
            wrapperStyle={{ width: 512, height: 320 }}
            contentStyle={{ width: 1024, height: 640 }}
          >
            <BrowserChrome breakpoint="lg" previewWidth={1024}>
              <div className="min-h-0 flex-1 overflow-auto bg-background p-8">
                <Story />
              </div>
            </BrowserChrome>
          </TransformComponent>
        </TransformWrapper>
      </div>
    ),
  ],
};
