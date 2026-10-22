import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router";
import { MockAggregateInitializer } from "@zerospin/react";
import { prefixId } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { useContext, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { WallBreakpointPane } from "../modules/lib/WallBreakpointPane";
import { WallModuleAction } from "../modules/lib/wall/WallModuleAction";
import { WallViewportProvider, useWallViewport } from "../modules/lib/WallViewportProvider";
import { BREAKPOINTS } from "../modules/lib/breakpoints";
import { makePlacementId } from "@qrk.sh/zerospin/src/modules/lib/makePlacementId";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { modulesHash } from "../modules/lib/modulesHash";
import { UserUI } from "@/zerospin/UserUI";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { WallEditorProvider } from "@/app/[username]/site/[siteId]/page/[pageId]/WallEditorProvider";
import { WallEditorContext } from "@/app/[username]/site/[siteId]/page/[pageId]/WallEditorContext";
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
  const { regionRef } = useWallViewport();
  return (
    <div ref={regionRef} className="w-full">
      <WallEditorProvider>
        <WallStoryContent />
      </WallEditorProvider>
    </div>
  );
}

function WallStoryContent() {
  const editor = useContext(WallEditorContext);
  const { activeBreakpoint } = useWallViewport();
  const navigate = useNavigate();
  if (editor === null) throw new Error("Wall story requires WallEditorProvider");
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 border bg-background p-2 text-sm">
        <span>Drag a module into the wall</span>
        {editor.activeWallId !== null ? (
          <WallModuleAction wallId={editor.activeWallId} moduleId="swatch-and-icon" />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Real local session · the app's queries, commands, and editing form.
      </p>
      <div className="min-h-64 border bg-background">
        {activeBreakpoint === null ? (
          <p>At least 360px is needed.</p>
        ) : (
          editor.renderWall(activeBreakpoint)
        )}
      </div>
      <button
        type="button"
        className="text-sm underline"
        onClick={() => {
          void navigate({
            to: "/$username/site/$siteId/page/$pageId",
            params: { username: "story", siteId, pageId },
            search: {},
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
      validateSearch: (search: Record<string, unknown>): { insertion?: string } =>
        typeof search.insertion === "string" ? { insertion: search.insertion } : {},
      component: WallStoryPage,
    });
    const detail = createRoute({
      getParentRoute: () => editor,
      path: "brick/$brickId",
      component: BrickDetail,
    });
    return createRouter({
      routeTree: root.addChildren([editor.addChildren([detail])]),
      history: createMemoryHistory({ initialEntries: [`/story/site/${siteId}/page/${pageId}`] }),
    });
  });
  return (
    <div data-wall-story="" style={{ width }}>
      <style>{`[data-wall-story] [data-wall-placement] { min-height: ${rowHeight}px; }`}</style>
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
              <WallViewportProvider>
                <RouterProvider router={router} />
              </WallViewportProvider>
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
            <WallBreakpointPane
              breakpoint="lg"
              previewWidth={1024}
              isActive
              isOutgoing={false}
              isOnStage
              isTransitioning={false}
              direction={0}
              reducedMotion
              onOutgoingComplete={() => {}}
            >
              <div className="min-h-0 flex-1 overflow-auto bg-background p-8">
                <Story />
              </div>
            </WallBreakpointPane>
          </TransformComponent>
        </TransformWrapper>
      </div>
    ),
  ],
};
