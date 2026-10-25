import { MockAggregateInitializer } from "@zerospin/react";
import { prefixId } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Laptop, Monitor, MoveHorizontal, Smartphone, Tablet } from "lucide-react";

import { Drawer } from "../modules/lib/Drawer";
import { ModuleFilmstrip } from "../modules/lib/ModuleFilmstrip";
import { SiteHeader } from "../app/[username]/site/[siteId]/SiteHeader";
import { BrowserChrome } from "../modules/lib/BrowserChrome";
import { WallEditor } from "../modules/lib/wall/WallEditor";
import { Button } from "../modules/components/ui/button";
import { BREAKPOINTS } from "../modules/lib/breakpoints";
import { makePlacementId } from "@qrk.sh/zerospin/src/modules/lib/makePlacementId";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { modulesHash } from "../modules/lib/modulesHash";
import { UserUI } from "@/zerospin/UserUI";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

const { user, site, page, wall, brick, placement } = userSessionDefinition.models;
const userId = prefixId(user, "story");
const siteId = prefixId(site, "story");
const pageId = prefixId(page, "story");
const claims = { aggregateId: "wall-story", clerkUserId: "wall-story" };

function makeResources(emptyWall: boolean, brickGap: number, stickyNavbar: boolean) {
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
            : [
                {
                  id: prefixId({ abbreviation: "sec" }, `story-${id}`),
                  stacks: [
                    {
                      id: prefixId({ abbreviation: "stk" }, `story-${id}`),
                      name: "Stack 1",
                      rows: [0, 1].map((position) => ({
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

function WallEditorStory(props: { emptyWall: boolean; brickGap: number; stickyNavbar: boolean }) {
  const { emptyWall, brickGap, stickyNavbar } = props;
  const [resources] = useState(() => makeResources(emptyWall, brickGap, stickyNavbar));
  const [breakpoint, setBreakpoint] = useState<(typeof BREAKPOINTS)[number]>(BREAKPOINTS[0]);
  const wallId = prefixId(wall, `story-${breakpoint.id}`);

  return (
    <MockAggregateInitializer
      definition={userSessionDefinition}
      claims={claims}
      resources={resources}
      renderError={(error, retry) => (
        <div role="alert">
          {error.message}
          <Button type="button" variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
    >
      {({ session, isLoaded }) =>
        isLoaded ? (
          <UserUI session={session}>
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900 antialiased">
              <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
                <h1 className="text-sm font-medium tracking-tight">Wall editor</h1>
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
                        onClick={() => setBreakpoint(entry)}
                        className={`h-7 gap-2 rounded-md px-2.5 text-xs tabular-nums ${entry.id === breakpoint.id ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500"}`}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span>{entry.previewWidth}</span>
                      </Button>
                    );
                  })}
                </div>
              </header>
              <main className="min-h-0 flex-1 overflow-auto px-8 py-6 [--wall-frame-height:100%]">
                <div
                  className="mx-auto h-full min-h-60 rounded-2xl shadow-[0_12px_40px_-16px_rgb(0_0_0/0.2)]"
                  style={{ width: breakpoint.previewWidth }}
                >
                  <BrowserChrome breakpoint={breakpoint.id} previewWidth={breakpoint.previewWidth}>
                    <div
                      className="wall-preview-scroll min-h-0 flex-1 overflow-y-auto bg-white"
                      role="region"
                      aria-label={`${breakpoint.id} page preview`}
                    >
                      <div className="@container grid min-h-full grid-rows-[auto_1fr]">
                        <SiteHeader siteId={siteId} />
                        <WallEditor key={wallId} wallId={wallId} />
                      </div>
                    </div>
                  </BrowserChrome>
                </div>
              </main>
              <div className="h-[280px] min-w-0 shrink-0">
                <Drawer side="bottom" layoutMode="flow" animated={false} aria-label="Bricks drawer">
                  <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
                    <div className="flex items-baseline gap-3">
                      <p className="text-xs text-zinc-500">Drag a brick onto your page</p>
                    </div>
                    <span className="flex items-center gap-2 text-xs text-zinc-400">
                      <MoveHorizontal className="size-3.5" aria-hidden="true" />
                      Scroll to browse
                    </span>
                  </header>
                  <div className="min-h-0 flex-1">
                    <ModuleFilmstrip
                      breakpoint={breakpoint.id}
                      cardStyle={false}
                      renderModuleLink={(brickModule) => <span>{brickModule.label}</span>}
                    />
                  </div>
                </Drawer>
              </div>
            </div>
          </UserUI>
        ) : (
          <p role="status">Opening local session…</p>
        )
      }
    </MockAggregateInitializer>
  );
}

const meta = {
  title: "App/Studio/Wall Editor",
  parameters: { layout: "fullscreen" },
  args: {
    emptyWall: false,
    brickGap: 1,
    stickyNavbar: true,
  },
  argTypes: {
    stickyNavbar: { control: "boolean" },
    brickGap: { control: { type: "range", min: 0, max: 12, step: 1 } },
  },
  render: function Render(props: { emptyWall: boolean; brickGap: number; stickyNavbar: boolean }) {
    const { emptyWall, brickGap, stickyNavbar } = props;
    return (
      <WallEditorStory
        key={`${emptyWall}-${brickGap}-${stickyNavbar}`}
        emptyWall={emptyWall}
        brickGap={brickGap}
        stickyNavbar={stickyNavbar}
      />
    );
  },
} satisfies Meta<{ emptyWall: boolean; brickGap: number; stickyNavbar: boolean }>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
export const EmptyWall: StoryObj<typeof meta> = { args: { emptyWall: true } };
