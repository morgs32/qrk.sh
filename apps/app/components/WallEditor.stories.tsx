import { SessionProvider, SessionReady, useMockAggregateSession } from "@zerospin/react";
import { prefixId } from "@zerospin/sdk/browser";
import type { IInferResource } from "@zerospin/core/models/types";
import { Schema } from "effect";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Laptop, Monitor, MoveHorizontal, MoveVertical, Smartphone, Tablet } from "lucide-react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  useParams,
} from "@tanstack/react-router";

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
import { StackDetails } from "../app/[username]/site/[siteId]/page/[pageId]/StackDetails/StackDetails";

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
) {
  const timestamps = {
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    updatedAt: new Date("2026-10-20T00:00:00.000Z"),
  };
  const bricks: IInferResource<typeof brick>[] = emptyWall
    ? []
    : (crossRowFixture ? [0, 1, 2, 3, 4] : fixture === "default" ? [0, 1, 2] : [0]).map(
        (position) =>
          Schema.decodeUnknownSync(Schema.toType(brick.resourceJsonCodec))({
            ...timestamps,
            modelName: brick.modelName,
            version: brick.version,
            id: prefixId(brick, `story-${position}`),
            pageId,
            moduleId:
              crossRowFixture && position === 4
                ? "article"
                : fixture === "default"
                  ? "swatch-and-icon"
                  : fixture,
            borderWidth,
            stateRevision: 0,
            state:
              crossRowFixture && position === 4
                ? structuredClone(modulesHash.article.def.state)
                : fixture === "default"
                  ? {
                      ...swatchAndIconV1.defaultState,
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
                            id: prefixId({ abbreviation: "row" }, `story-${id}-0`),
                            placementIds: bricks
                              .slice(0, 2)
                              .map((entry) => makePlacementId(entry.id, id)),
                          },
                          {
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
                            id: prefixId({ abbreviation: "row" }, `story-${id}-2`),
                            placementIds: [makePlacementId(bricks[3].id, id)],
                          },
                          {
                            id: prefixId({ abbreviation: "row" }, `story-${id}-3`),
                            placementIds: [makePlacementId(bricks[4].id, id)],
                          },
                          {
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
                        rows: (fixture === "default" ? [0, 1] : [0]).map((position) => ({
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
          spec: modulesHash[entry.moduleId].variants.default.spec,
        }),
      ),
    ),
  };
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
  } = props;
  const [shadowVisible, setShadowVisible] = useState(false);
  const [resources] = useState(() =>
    makeResources(
      emptyWall,
      brickGap,
      stickyNavbar,
      borderWidth,
      cardStyle,
      shadowFixture ? "swatch-and-icon" : fixture,
      crossRowFixture,
    ),
  );
  const [selectedBrickId, setSelectedBrickId] = useState<string | null>(() =>
    selected ? (resources.brick[0]?.id ?? null) : null,
  );
  const [breakpoint, setBreakpoint] = useState<(typeof BREAKPOINTS)[number]>(BREAKPOINTS[0]);
  const wallId = prefixId(wall, `story-${breakpoint.id}`);
  const previewStyle = {
    "--wall-preview-width": `${breakpoint.previewWidth}px`,
    "--wall-preview-border-width": `${PREVIEW_BORDER_WIDTH}px`,
    minWidth: breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH,
    minHeight: "100%",
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
          <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6">
            <h1 className="text-sm font-medium tracking-tight">Wall editor</h1>
            {fixture !== "default" && resources.brick.length > 0 ? (
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
          <div className={`flex min-h-0 flex-1 flex-col ${verticalAtLg ? "lg:flex-row" : ""}`}>
            <main className="min-h-0 min-w-0 flex-1 overflow-auto px-8 py-6">
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
                className="wall-preview-frame relative isolate flex w-full flex-col"
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
                  <WallEditor
                    key={wallId}
                    wallId={wallId}
                    selectedBrickId={selectedBrickId}
                    onEditBrick={fixture === "default" ? undefined : setSelectedBrickId}
                  />
                </div>
              </div>
            </main>
            <div
              className={`h-[280px] min-w-0 shrink-0 ${verticalAtLg ? "lg:h-full lg:w-[420px]" : ""}`}
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
                      renderModuleLink={(brickModule) => <span>{brickModule.label}</span>}
                    />
                  ) : (
                    <ModulePreview
                      brickModule={modulesHash[fixture]}
                      breakpoint={breakpoint.id}
                      cardStyle={cardStyle}
                      moduleLink={<span>{modulesHash[fixture].label}</span>}
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
  title: "App/Studio/Wall Editor",
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
    const shadowFixture = context.id.endsWith("--shadow-brick");
    const crossRowFixture = context.id.includes("--cross-row-");
    const populatedFixture =
      context.id.endsWith("--preview-brick") || context.id.endsWith("--placement-brick");
    return (
      <WallEditorStory
        key={`${emptyWall}-${brickGap}-${stickyNavbar}-${borderWidth}-${cardStyle}-${fixture}-${selected}-${shadowFixture}-${crossRowFixture}`}
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
export const EmptyWall: StoryObj<typeof meta> = { args: { emptyWall: true } };

/** The real drawer stages renames against the story's command-backed session. */
export const StackNameEditor: StoryObj<typeof meta> = {
  render: function Render() {
    const [resources] = useState(() => makeResources(false, 0, true, 0, false, "default"));
    const [router] = useState(() => {
      const root = createRootRoute({ component: Outlet });
      const pageRoute = createRoute({
        getParentRoute: () => root,
        path: "/$username/site/$siteId/page/$pageId",
        validateSearch: (search: Record<string, unknown>) => ({
          breakpoint: typeof search.breakpoint === "string" ? search.breakpoint : "sm",
        }),
        component: function StackEditor() {
          const { stackId } = useParams({ strict: false });
          const navigate = useNavigate();
          return (
            <div className="flex h-dvh flex-col bg-zinc-100 text-zinc-900">
              <main className="min-h-0 flex-1 overflow-auto p-8">
                <div className="wall-preview-frame w-[362px]">
                  <BrowserChrome breakpoint="sm" />
                  <SiteHeader siteId={siteId} />
                  <WallEditor
                    wallId={prefixId(wall, "story-sm")}
                    selectedStackId={stackId}
                    onEditStack={(id) => {
                      if (stackId === id) return;
                      void navigate({
                        to: "/$username/site/$siteId/page/$pageId/stack/$stackId",
                        params: { username: "story", siteId, pageId, stackId: id },
                        search: { breakpoint: "sm" },
                      });
                    }}
                  />
                </div>
              </main>
              {stackId === undefined ? (
                <p className="p-6">Click the Stack name to open its editor.</p>
              ) : (
                <div className="h-[280px] shrink-0">
                  <Drawer
                    side="bottom"
                    layoutMode="flow"
                    animated={false}
                    aria-label="Stack details drawer"
                  >
                    <h1 className="border-b px-6 py-3">Stack Details</h1>
                    <Outlet />
                  </Drawer>
                </div>
              )}
            </div>
          );
        },
      });
      const stackRoute = createRoute({
        getParentRoute: () => pageRoute,
        path: "stack/$stackId",
        component: StackDetails,
      });
      return createRouter({
        routeTree: root.addChildren([pageRoute.addChildren([stackRoute])]),
        history: createMemoryHistory({
          initialEntries: [`/story/site/${siteId}/page/${pageId}?breakpoint=sm`],
        }),
      });
    });
    const session = useMockAggregateSession(userSessionDefinition, { claims, resources });
    return (
      <SessionProvider session={session}>
        <SessionReady
          definition={userSessionDefinition}
          fallback={<p role="status">Opening local session…</p>}
          renderError={(error, retry) => (
            <div role="alert">
              {error.message}
              <Button type="button" onClick={retry}>
                Retry
              </Button>
            </div>
          )}
        >
          <RouterProvider router={router} />
        </SessionReady>
      </SessionProvider>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole(
      "button",
      { name: "Edit stack Stack 1" },
      { timeout: 10000 },
    );
    await userEvent.click(name);
    const input = await canvas.findByRole("textbox", { name: "Stack name" });
    const stack = canvasElement.querySelector<HTMLElement>("[data-wall-stack-id]");
    const tab = name.parentElement;
    if (stack === null || tab === null) throw new Error("Missing Stack fixture");
    await userEvent.click(input);
    expect(stack).toHaveClass("is-selected-stack");
    expect(stack.matches(":focus-within")).toBe(false);
    await waitFor(() => expect(getComputedStyle(tab).opacity).toBe("1"));
    const border = getComputedStyle(stack, "::after");
    expect(border.borderWidth).toBe("1px");
    expect(border.borderColor).toBe("rgb(31, 155, 252)");
    expect(border.zIndex).toBe("29");
    expect(border.pointerEvents).toBe("none");

    await userEvent.clear(input);
    await userEvent.type(input, "  Featured  ");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const savedName = await canvas.findByRole("button", { name: "Edit stack Featured" });
    await waitFor(() => expect(input).toHaveValue("Featured"));
    expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, "Unsubmitted name");
    // Selecting the same route keeps its existing draft.
    await userEvent.click(savedName);
    expect(input).toHaveValue("Unsubmitted name");
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue("Featured");
    expect(input).toBeVisible();
    expect(stack).toHaveClass("is-selected-stack");
  },
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

/** Same content and width through the actual catalog and Wall render paths. */
export const PreviewBrick: StoryObj<typeof meta> = {
  args: { fixture: "swatch-and-icon", emptyWall: false },
  argTypes: {
    fixture: { options: ["swatch-and-icon", "article"] },
    emptyWall: { control: false },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Source preview and existing placement use matching content. Choose Swatch and Icon or Article, flat/card treatment, gap, saved border, and breakpoint. Real pointer hover and keyboard focus use the same blue decoration without resizing the surface.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            `[data-drawer-module-id="${args.fixture}"][draggable="true"]`,
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    const source = canvasElement.querySelector<HTMLElement>(
      `[data-drawer-module-id="${args.fixture}"]`,
    );
    const placed = canvasElement.querySelector<HTMLElement>(
      "[data-wall-placement-id] .brick-hover-surface",
    );
    if (source === null || placed === null) throw new Error("Missing Brick comparison fixture");
    source.scrollIntoView({ block: "nearest", inline: "nearest" });
    const surface = source.querySelector<HTMLElement>(".brick-hover-surface");
    const content = surface?.querySelector<HTMLElement>(".brick-content");
    const actions = source.querySelector<HTMLElement>(".brick-action");
    if (!surface || !content || !actions) throw new Error("Missing catalog Brick surface");
    const action = within(source).getByRole("button", { name: "Preview brick action" });
    const before = surface.getBoundingClientRect();
    // Content boxes match; the Wall's half-gap padding is measured separately.
    expect(before.width).toBeCloseTo(placed.getBoundingClientRect().width, 1);
    expect(before.height).toBeCloseTo(placed.getBoundingClientRect().height, 1);
    expect(getComputedStyle(surface).overflow).toBe("visible");
    expect(getComputedStyle(content).overflow).toBe("hidden");
    expect(getComputedStyle(surface).borderRadius).toBe(args.cardStyle ? "8px" : "0px");
    expect(getComputedStyle(content).borderRadius).toBe(args.cardStyle ? "8px" : "0px");
    // CSS :hover is verified with a real browser pointer, rather than synthetic events.
    if (!source.matches(":hover")) {
      expect(getComputedStyle(surface, "::after").opacity).toBe("0");
      expect(getComputedStyle(actions).opacity).toBe("0");
    }
    action.focus();
    await waitFor(() => expect(getComputedStyle(actions).opacity).toBe("1"));
    const paint = getComputedStyle(surface, "::after");
    expect(paint.opacity).toBe("1");
    expect(paint.borderWidth).toBe("1px");
    expect(paint.borderColor).toBe("rgb(31, 155, 252)");
    expect(paint.boxShadow).toContain("rgba(31, 155, 252, 0.3)");
    expect(paint.boxShadow).toContain("rgba(31, 155, 252, 0.15)");
    expect(paint.boxShadow).toContain("inset");
    expect(getComputedStyle(actions).backgroundColor).toBe("rgb(31, 155, 252)");
    expect(surface.getBoundingClientRect().width).toBeCloseTo(before.width, 1);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    action.blur();
  },
};

/** Selection is an edited Brick; keyboard focus remains a separate state. */
export const PlacementBrick: StoryObj<typeof meta> = {
  args: { fixture: "swatch-and-icon", emptyWall: false },
  argTypes: {
    fixture: { options: ["swatch-and-icon", "article"] },
    emptyWall: { control: false },
  },
  parameters: {
    docs: {
      description: {
        story:
          "The play function checks focus, selection while focus is elsewhere, and the action menu's portal and Escape return. Pointer hover remains available for direct inspection; selection and an open menu alone do not reveal action tabs.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () => expect(canvasElement.querySelector("[data-wall-placement-id]")).not.toBeNull(),
      { timeout: 10000 },
    );
    const placementElement = canvasElement.querySelector<HTMLElement>("[data-wall-placement-id]");
    const surface = placementElement?.querySelector<HTMLElement>(".brick-hover-surface");
    const content = surface?.querySelector<HTMLElement>(".brick-content");
    const actions = placementElement?.querySelector<HTMLElement>(".brick-action");
    if (!placementElement || !surface || !content || !actions)
      throw new Error("Missing placed Brick fixture");
    const before = surface.getBoundingClientRect();
    const hitbox = placementElement.getBoundingClientRect();
    expect(hitbox.width - before.width).toBeCloseTo(args.brickGap, 1);
    expect(hitbox.height - before.height).toBeCloseTo(args.brickGap, 1);
    expect(getComputedStyle(surface).borderRadius).toBe(args.cardStyle ? "8px" : "0px");
    expect(getComputedStyle(content).overflow).toBe("hidden");
    const selectedControl = within(canvasElement).getByRole("checkbox", {
      name: "Selected placement",
    });
    // Select without focusing the Brick: its content decoration persists on its own.
    if (!args.selected) await userEvent.click(selectedControl);
    selectedControl.focus();
    await waitFor(() => expect(placementElement.classList.contains("is-selected")).toBe(true));
    const selectedPaint = getComputedStyle(surface, "::after");
    expect(selectedPaint.opacity).toBe("1");
    expect(selectedPaint.borderWidth).toBe("1px");
    expect(selectedPaint.borderColor).toBe("rgb(31, 155, 252)");
    expect(selectedPaint.boxShadow).toContain("rgba(31, 155, 252, 0.3)");
    expect(selectedPaint.boxShadow).toContain("rgba(31, 155, 252, 0.15)");
    if (!placementElement.matches(":hover"))
      await waitFor(() => expect(getComputedStyle(actions).opacity).toBe("0"));
    const action = within(placementElement).getByRole("button", { name: /Brick .* actions/ });
    action.focus();
    await waitFor(() => expect(getComputedStyle(actions).opacity).toBe("1"));
    expect(getComputedStyle(actions).backgroundColor).toBe("rgb(31, 155, 252)");
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    await userEvent.click(action);
    const editItem = await within(document.body).findByRole("menuitem", { name: "Edit" });
    editItem.focus();
    expect(placementElement.classList.contains("is-menu-open")).toBe(true);
    expect(placementElement.matches(":focus-within")).toBe(false);
    expect(getComputedStyle(surface, "::after").opacity).toBe("1");
    if (!placementElement.matches(":hover"))
      await waitFor(() => expect(getComputedStyle(actions).opacity).toBe("0"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(placementElement.classList.contains("is-menu-open")).toBe(false));
    expect(document.activeElement).toBe(action);
    await waitFor(() => expect(getComputedStyle(actions).opacity).toBe("1"));
    expect(surface.getBoundingClientRect().width).toBeCloseTo(before.width, 1);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    expect(placementElement.getBoundingClientRect().height).toBeCloseTo(hitbox.height, 1);
    // Leave selection visible while focus sits outside the Brick.
    selectedControl.focus();
    expect(getComputedStyle(surface, "::after").opacity).toBe("1");
  },
};

/** Native copy, inert insertion shadow, cancellation, and crowded-row geometry. */
export const ShadowBrick: StoryObj<typeof meta> = {
  args: { fixture: "swatch-and-icon" },
  argTypes: { fixture: { options: ["swatch-and-icon", "article"] } },
  beforeEach: ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      // Synthetic drags need the dragend that a native Escape would dispatch.
      if (event.key === "Escape") fireEvent.dragEnd(document.body);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      fireEvent.dragEnd(document.body);
    };
  },
  parameters: {
    docs: {
      description: {
        story:
          "Source preview is the selected fixture; existing neighbors are Swatches, so Article can be dragged without exceeding its page limit. The play function checks all breakpoints, cancellation, native-copy paint, and a crowded Swatch Row. The final sm shadow stays visible; Escape changes the status to Shadow absent. No drop is performed.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            `[data-drawer-module-id="${args.fixture}"][draggable="true"]`,
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    // Finish at sm so the final visible shadow remains compact.
    for (const entry of [...BREAKPOINTS.slice(1), BREAKPOINTS[0]]) {
      fireEvent.dragEnd(document.body);
      await waitFor(() =>
        expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull(),
      );
      await waitFor(() =>
        expect(within(canvasElement).getByTestId("shadow-status").textContent).toContain(
          "Shadow absent",
        ),
      );
      await userEvent.click(
        within(canvasElement).getByRole("button", {
          name: `${entry.id} preview, ${entry.previewWidth}px`,
        }),
      );
      await waitFor(
        () =>
          expect(
            canvasElement.querySelector(`[aria-label="${entry.id} Wall editor"]`),
          ).not.toBeNull(),
        { timeout: 10000 },
      );
      const source = canvasElement.querySelector<HTMLElement>(
        `[data-drawer-module-id="${args.fixture}"]`,
      );
      const row = canvasElement.querySelector<HTMLElement>("[data-wall-row-id]");
      const target = row ?? canvasElement.querySelector<HTMLElement>(".wall-editor");
      const placed = row?.querySelector<HTMLElement>(".brick-hover-surface");
      if (!source || !target) throw new Error("Missing shadow Brick fixture");
      source.scrollIntoView({ block: "nearest", inline: "nearest" });
      const sourceSurface = source.querySelector<HTMLElement>(".brick-hover-surface");
      if (!sourceSurface) throw new Error("Missing shadow source surface");
      const before = placed?.getBoundingClientRect();
      const sourceBox = sourceSurface.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(source, {
        dataTransfer,
        clientX: sourceBox.x + 8,
        clientY: sourceBox.y + 8,
      });
      // The native preview is intentionally present only until the next frame.
      const nativeCopy = document.querySelector<HTMLElement>(
        ".brick-drag-preview .brick-hover-surface",
      );
      if (!nativeCopy) throw new Error("Missing native Brick drag preview");
      const nativePaint = getComputedStyle(nativeCopy, "::after");
      expect(nativePaint.opacity).toBe("1");
      expect(nativePaint.borderWidth).toBe("2px");
      expect(nativePaint.borderColor).toBe("rgb(31, 155, 252)");
      expect(nativePaint.boxShadow).toBe("none");
      document
        .querySelectorAll<HTMLElement>(".brick-drag-preview .brick-action")
        .forEach((actions) => expect(getComputedStyle(actions).display).toBe("none"));
      await waitFor(() => expect(source.classList.contains("opacity-40")).toBe(true));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      fireEvent.dragOver(target, {
        dataTransfer,
        clientX: rect.x + rect.width / 2,
        clientY: rect.bottom - 1,
      });
      await waitFor(() =>
        expect(
          canvasElement.querySelector(".wall-shadow-placeholder .brick-hover-surface"),
        ).not.toBeNull(),
      );
      const shadow = canvasElement.querySelector<HTMLElement>(".wall-shadow-placeholder");
      const shadowSurface = shadow?.querySelector<HTMLElement>(".brick-hover-surface");
      if (!shadow || !shadowSurface) throw new Error("Missing insertion shadow surface");
      expect(shadowSurface.getBoundingClientRect().width).toBeCloseTo(sourceBox.width, 1);
      expect(shadowSurface.getBoundingClientRect().height).toBeCloseTo(sourceBox.height, 1);
      expect(
        shadow.getBoundingClientRect().height - shadowSurface.getBoundingClientRect().height,
      ).toBeCloseTo(args.brickGap, 1);
      if (placed && before)
        expect(placed.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
      expect(getComputedStyle(shadow).opacity).toBe("0.4");
      expect(getComputedStyle(shadow, "::after").content).toBe("none");
      expect(getComputedStyle(shadowSurface, "::after").content).toBe("none");
      expect(getComputedStyle(shadowSurface).borderRadius).toBe(args.cardStyle ? "8px" : "0px");
      const shadowContent = shadowSurface.querySelector<HTMLElement>(".brick-content");
      if (!shadowContent) throw new Error("Missing cloned Brick content");
      expect(getComputedStyle(shadowContent).overflow).toBe("hidden");
      expect(shadow.querySelector(".brick-action, .stack-action")).toBeNull();
      expect(shadow.firstElementChild?.hasAttribute("inert")).toBe(true);
      await waitFor(() =>
        expect(within(canvasElement).getByTestId("shadow-status").textContent).toContain(
          "Insertion shadow",
        ),
      );

      if (entry.id === "sm" && args.fixture === "swatch-and-icon" && row && placed) {
        // Inserting beside a Swatch shrinks both cells; compare the matched widths.
        fireEvent.dragEnd(document.body);
        await waitFor(() =>
          expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull(),
        );
        const placementElement = row.querySelector<HTMLElement>("[data-wall-placement-id]");
        if (!placementElement) throw new Error("Missing crowded Row placement");
        const placedBox = placementElement.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        fireEvent.dragStart(source, {
          dataTransfer,
          clientX: sourceBox.x + 8,
          clientY: sourceBox.y + 8,
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        fireEvent.dragOver(placementElement, {
          dataTransfer,
          clientX: placedBox.right - 1,
          clientY: rowBox.top + rowBox.height / 2,
        });
        await waitFor(() =>
          expect(row.querySelector(".wall-shadow-placeholder .brick-hover-surface")).not.toBeNull(),
        );
        const crowdedShadow = row.querySelector<HTMLElement>(
          ".wall-shadow-placeholder .brick-hover-surface",
        );
        if (!crowdedShadow) throw new Error("Missing crowded Row shadow");
        expect(crowdedShadow.getBoundingClientRect().width).toBeLessThan(sourceBox.width);
        expect(crowdedShadow.getBoundingClientRect().width).toBeCloseTo(
          placed.getBoundingClientRect().width,
          1,
        );
        expect(crowdedShadow.getBoundingClientRect().height).toBeCloseTo(
          placed.getBoundingClientRect().height,
          1,
        );
      }
    }
  },
};

/** A stationary pointer must keep its destination as the shadow changes layout. */
export const ShadowStability: StoryObj<typeof meta> = {
  args: { brickGap: 0 },
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            '[data-drawer-module-id="swatch-and-icon"][draggable="true"]',
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    const source = canvasElement.querySelector<HTMLElement>(
      '[data-drawer-module-id="swatch-and-icon"]',
    );
    // The default fixture's final Row contains one Swatch.
    const row = Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-wall-row-id]")).at(
      -1,
    );
    const placement = row?.querySelector<HTMLElement>("[data-wall-placement-id]");
    const contentRow = placement?.parentElement;
    if (
      source === null ||
      row === undefined ||
      placement === null ||
      placement === undefined ||
      !contentRow
    )
      throw new Error("Missing singleton Swatch fixture");
    source.scrollIntoView({ block: "nearest", inline: "nearest" });
    const sourceBox = source.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const clientX = Math.min(placement.getBoundingClientRect().right + 8, rowBox.right - 1);
    expect(clientX).toBeLessThan(rowBox.right);

    try {
      for (const { position, fraction } of [
        { position: "before", fraction: 1 / 8 },
        { position: "after", fraction: 7 / 8 },
        { position: "combine", fraction: 1 / 2 },
      ]) {
        const dataTransfer = new DataTransfer();
        fireEvent.dragStart(source, {
          dataTransfer,
          clientX: sourceBox.x + 8,
          clientY: sourceBox.y + 8,
        });
        await waitFor(() => expect(source.classList.contains("opacity-40")).toBe(true));
        const clientY = rowBox.top + rowBox.height * fraction;

        for (let repetition = 0; repetition < 4; repetition += 1) {
          // Re-hit-test after every layout change, just as the browser does.
          const target = document.elementFromPoint(clientX, clientY);
          if (target === null) throw new Error("Missing fixed-pointer drag target");
          fireEvent.dragOver(target, { dataTransfer, clientX, clientY });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await waitFor(() => {
            const shadow = row.querySelector(".wall-shadow-placeholder");
            expect(shadow).not.toBeNull();
            if (position === "before") expect(shadow?.nextElementSibling).toBe(contentRow);
            else if (position === "after") expect(shadow?.previousElementSibling).toBe(contentRow);
            else expect(shadow?.parentElement).toBe(contentRow);
          });
        }

        fireEvent.dragEnd(source, { dataTransfer });
        await waitFor(() =>
          expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull(),
        );
      }
    } finally {
      fireEvent.dragEnd(source);
    }
  },
};

/** Mixed-height Bricks share one content-sized Row before and after command-backed drops. */
export const EqualHeightRows: StoryObj<typeof meta> = {
  args: { brickGap: 0, cardStyle: false },
  parameters: {
    docs: {
      description: {
        story:
          "At each breakpoint, a taller Figma shadow grows a Swatch Row and stretches its visible surface. Leaving restores the original height. A real drop keeps both Bricks equal; a shorter Swatch shadow fills that Row. Deleting the Figma Brick through its menu restores the Swatch's natural height. Figma uses static example content and its module-owned placeholder, without a provider request.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const body = within(document.body);
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            '[data-drawer-module-id="figma-thumbnail"][draggable="true"]',
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );

    for (const entry of BREAKPOINTS) {
      await userEvent.click(
        canvas.getByRole("button", { name: `${entry.id} preview, ${entry.previewWidth}px` }),
      );
      const rowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-1`);
      await waitFor(() =>
        expect(canvasElement.querySelector(`[data-wall-row-id="${rowId}"]`)).not.toBeNull(),
      );
      const row = canvasElement.querySelector<HTMLElement>(`[data-wall-row-id="${rowId}"]`);
      const placed = row?.querySelector<HTMLElement>("[data-wall-placement-id]");
      const surface = placed?.querySelector<HTMLElement>(".brick-hover-surface");
      const tallSource = canvasElement.querySelector<HTMLElement>(
        '[data-drawer-module-id="figma-thumbnail"]',
      );
      const shortSource = canvasElement.querySelector<HTMLElement>(
        '[data-drawer-module-id="swatch-and-icon"]',
      );
      if (!row || !placed || !surface || !tallSource || !shortSource)
        throw new Error("Missing mixed-height Row fixture");
      const naturalHeight = surface.getBoundingClientRect().height;
      const initialPlacementCount = canvasElement.querySelectorAll(
        "[data-wall-placement-id]",
      ).length;
      const tallDataTransfer = new DataTransfer();

      try {
        tallSource.scrollIntoView({ block: "nearest", inline: "nearest" });
        const sourceBox = tallSource.getBoundingClientRect();
        fireEvent.dragStart(tallSource, {
          dataTransfer: tallDataTransfer,
          clientX: sourceBox.x + 8,
          clientY: sourceBox.y + 8,
        });
        await waitFor(() => expect(tallSource.classList.contains("opacity-40")).toBe(true));
        const rowBox = row.getBoundingClientRect();
        const placedBox = placed.getBoundingClientRect();
        const clientX = placedBox.left + Math.min(8, placedBox.width / 2);
        const clientY = rowBox.top + rowBox.height / 2;
        fireEvent.dragOver(placed, { dataTransfer: tallDataTransfer, clientX, clientY });
        await waitFor(() => {
          const shadow = row.querySelector<HTMLElement>(".wall-shadow-placeholder");
          const shadowSurface = shadow?.querySelector<HTMLElement>(".brick-hover-surface");
          if (!shadow || !shadowSurface) throw new Error("Missing taller insertion shadow");
          expect(surface.getBoundingClientRect().height).toBeGreaterThan(naturalHeight);
          expect(shadowSurface.getBoundingClientRect().height).toBeCloseTo(
            surface.getBoundingClientRect().height,
            1,
          );
          for (const brickSurface of [surface, shadowSurface]) {
            const root = brickSurface.querySelector<HTMLElement>(".brick-content > *");
            if (!root) throw new Error("Missing visible Brick module root");
            expect(root.getBoundingClientRect().height).toBeCloseTo(
              brickSurface.getBoundingClientRect().height,
              1,
            );
          }
          expect(
            shadow.getBoundingClientRect().height - shadowSurface.getBoundingClientRect().height,
          ).toBeCloseTo(args.brickGap, 1);
          expect(
            placed.getBoundingClientRect().height - surface.getBoundingClientRect().height,
          ).toBeCloseTo(args.brickGap, 1);
          expect(getComputedStyle(shadowSurface).borderRadius).toBe(args.cardStyle ? "8px" : "0px");
        });

        // Leaving the destination removes only temporary layout, without staging a Brick.
        fireEvent.dragOver(document.body, {
          dataTransfer: tallDataTransfer,
          clientX: 0,
          clientY: 0,
        });
        await waitFor(() => {
          expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull();
          expect(surface.getBoundingClientRect().height).toBeCloseTo(naturalHeight, 1);
        });
        expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(
          initialPlacementCount,
        );

        fireEvent.dragOver(placed, { dataTransfer: tallDataTransfer, clientX, clientY });
        await waitFor(() => expect(row.querySelector(".wall-shadow-placeholder")).not.toBeNull());
        fireEvent.drop(placed, { dataTransfer: tallDataTransfer, clientX, clientY });
        fireEvent.dragEnd(tallSource, { dataTransfer: tallDataTransfer });
        await waitFor(() => {
          expect(row.querySelectorAll("[data-wall-placement-id]")).toHaveLength(2);
          const surfaces = Array.from(row.querySelectorAll<HTMLElement>(".brick-hover-surface"));
          expect(surfaces).toHaveLength(2);
          expect(surfaces[0].getBoundingClientRect().height).toBeGreaterThan(naturalHeight);
          expect(surfaces[0].getBoundingClientRect().height).toBeCloseTo(
            surfaces[1].getBoundingClientRect().height,
            1,
          );
          for (const brickSurface of surfaces) {
            const root = brickSurface.querySelector<HTMLElement>(".brick-content > *");
            if (!root) throw new Error("Missing committed Brick module root");
            expect(root.getBoundingClientRect().height).toBeCloseTo(
              brickSurface.getBoundingClientRect().height,
              1,
            );
          }
        });
        const grownHeight = surface.getBoundingClientRect().height;

        shortSource.scrollIntoView({ block: "nearest", inline: "nearest" });
        const shortBox = shortSource.getBoundingClientRect();
        const shortDataTransfer = new DataTransfer();
        fireEvent.dragStart(shortSource, {
          dataTransfer: shortDataTransfer,
          clientX: shortBox.x + 8,
          clientY: shortBox.y + 8,
        });
        await waitFor(() => expect(shortSource.classList.contains("opacity-40")).toBe(true));
        const grownRowBox = row.getBoundingClientRect();
        fireEvent.dragOver(placed, {
          dataTransfer: shortDataTransfer,
          clientX: placed.getBoundingClientRect().left + 8,
          clientY: grownRowBox.top + grownRowBox.height / 2,
        });
        await waitFor(() => {
          const shadowSurface = row.querySelector<HTMLElement>(
            ".wall-shadow-placeholder .brick-hover-surface",
          );
          if (!shadowSurface) throw new Error("Missing shorter insertion shadow");
          expect(shadowSurface.getBoundingClientRect().height).toBeCloseTo(grownHeight, 1);
          expect(surface.getBoundingClientRect().height).toBeCloseTo(grownHeight, 1);
        });
        fireEvent.dragEnd(shortSource, { dataTransfer: shortDataTransfer });
        await waitFor(() => expect(row.querySelector(".wall-shadow-placeholder")).toBeNull());
        expect(row.querySelectorAll("[data-wall-placement-id]")).toHaveLength(2);

        const added = Array.from(
          row.querySelectorAll<HTMLElement>("[data-wall-placement-id]"),
        ).find((element) => element !== placed);
        if (!added) throw new Error("Missing command-created Figma Placement");
        await userEvent.click(within(added).getByRole("button", { name: /Brick .* actions/ }));
        await userEvent.click(await body.findByRole("menuitem", { name: "Delete Brick" }));
        await userEvent.click(await body.findByRole("button", { name: /^Delete Brick$/ }));
        await waitFor(() => {
          expect(row.querySelectorAll("[data-wall-placement-id]")).toHaveLength(1);
          expect(surface.getBoundingClientRect().height).toBeCloseTo(naturalHeight, 1);
        });
        expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(
          initialPlacementCount,
        );
      } finally {
        fireEvent.dragEnd(document.body);
      }
    }
  },
};

export const EqualHeightRowsWithGaps: StoryObj<typeof meta> = {
  ...EqualHeightRows,
  args: { brickGap: 12, cardStyle: true },
};

/** Saved Placement moves use commands while keeping their Row's geometry fixed. */
export const RowReorder: StoryObj<typeof meta> = {
  args: { selected: true, brickGap: 0 },
  parameters: {
    docs: {
      description: {
        story:
          "Drag the grip beside a Brick's action menu to reorder it within its Row. The play function verifies forward/backward movement, append, unchanged drops, cancellation, outside drops, stable geometry, retained selection, and unchanged breakpoint Walls against the real local session.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () => expect(canvasElement.querySelector("[data-wall-drag-handle]")).not.toBeNull(),
      { timeout: 10000 },
    );
    const firstBrickId = prefixId(brick, "story-0");
    const secondBrickId = prefixId(brick, "story-1");
    const thirdBrickId = prefixId(brick, "story-2");
    const firstId = makePlacementId(firstBrickId, "sm");
    const secondId = makePlacementId(secondBrickId, "sm");
    const thirdId = makePlacementId(thirdBrickId, "sm");
    const firstRowId = prefixId({ abbreviation: "row" }, "story-sm-0");
    const secondRowId = prefixId({ abbreviation: "row" }, "story-sm-1");
    const initialContents = Array.from(
      canvasElement.querySelectorAll<HTMLElement>("[data-wall-placement-id]"),
    ).map((element) => ({
      id: element.getAttribute("data-wall-placement-id"),
      content: element.querySelector(".brick-content")?.innerHTML,
    }));

    try {
      for (const scenario of [
        {
          sourceId: firstId,
          targetId: secondId,
          after: true,
          finish: "drop",
          indicator: true,
          order: [secondId, firstId],
        },
        {
          sourceId: firstId,
          targetId: secondId,
          after: false,
          finish: "drop",
          indicator: true,
          order: [firstId, secondId],
        },
        {
          sourceId: firstId,
          targetId: firstId,
          after: false,
          finish: "drop",
          indicator: false,
          order: [firstId, secondId],
        },
        {
          sourceId: firstId,
          targetId: secondId,
          after: false,
          finish: "drop",
          indicator: false,
          order: [firstId, secondId],
        },
        {
          sourceId: secondId,
          targetId: secondId,
          after: true,
          finish: "drop",
          indicator: false,
          order: [firstId, secondId],
        },
        {
          sourceId: secondId,
          targetId: firstId,
          after: false,
          finish: "cancel",
          indicator: true,
          order: [firstId, secondId],
        },
        {
          sourceId: thirdId,
          targetId: thirdId,
          after: false,
          finish: "drop",
          indicator: false,
          order: [firstId, secondId],
        },
        {
          sourceId: secondId,
          targetId: firstId,
          after: false,
          finish: "outside",
          indicator: true,
          order: [firstId, secondId],
        },
        {
          sourceId: secondId,
          targetId: firstId,
          after: false,
          finish: "drop",
          indicator: true,
          order: [secondId, firstId],
        },
      ]) {
        const row = canvasElement.querySelector<HTMLElement>(`[data-wall-row-id="${firstRowId}"]`);
        const source = canvasElement.querySelector<HTMLElement>(
          `[data-wall-placement-id="${scenario.sourceId}"]`,
        );
        const target = canvasElement.querySelector<HTMLElement>(
          `[data-wall-placement-id="${scenario.targetId}"]`,
        );
        const handle = source?.querySelector<HTMLElement>("[data-wall-drag-handle]");
        if (!row || !source || !target || !handle) throw new Error("Missing Row reorder fixture");
        handle.scrollIntoView({ block: "nearest", inline: "nearest" });
        const handleBox = handle.getBoundingClientRect();
        const sourceBox = source.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        fireEvent.dragStart(handle, {
          dataTransfer,
          clientX: handleBox.left + handleBox.width / 2,
          clientY: handleBox.top + handleBox.height / 2,
        });
        await waitFor(() => expect(getComputedStyle(source).opacity).toBe("0.4"));
        const clientX = scenario.after ? targetBox.right - 2 : targetBox.left + 2;
        const clientY = targetBox.top + targetBox.height / 2;
        fireEvent.dragOver(target, { dataTransfer, clientX, clientY });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await waitFor(() => {
          const indicator = canvasElement.querySelector<HTMLElement>("[data-wall-move-indicator]");
          if (scenario.indicator) {
            if (!indicator) throw new Error("Missing Row move indicator");
            const line = indicator.firstElementChild;
            if (!(line instanceof HTMLElement)) throw new Error("Missing Wall drop indicator");
            expect(line.getBoundingClientRect().width).toBeCloseTo(1, 1);
            // The line begins after the 4px terminal radius.
            expect(line.getBoundingClientRect().height).toBeCloseTo(rowBox.height - 4, 1);
            expect(getComputedStyle(indicator).pointerEvents).toBe("none");
            expect(getComputedStyle(line).backgroundColor).toBe("rgb(255, 255, 255)");
            expect(getComputedStyle(line).boxShadow).toBe("rgb(24, 104, 219) 0px 0px 0px 1px");
            expect(getComputedStyle(line, "::before").backgroundColor).toBe("rgb(255, 255, 255)");
            expect(getComputedStyle(line, "::before").borderWidth).toBe("1px");
            expect(indicator.parentElement).toBe(row.closest(".wall-editor"));
            expect(
              line.getBoundingClientRect().left + line.getBoundingClientRect().width / 2,
            ).toBeCloseTo(scenario.after ? targetBox.right : targetBox.left, 1);
            const chrome = canvasElement.querySelector(".wall-preview-chrome");
            if (chrome === null) throw new Error("Missing preview chrome");
            expect(Number(getComputedStyle(indicator).zIndex)).toBeGreaterThan(
              Number(getComputedStyle(chrome).zIndex),
            );
          } else expect(indicator).toBeNull();
        });
        expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull();
        expect(source.getBoundingClientRect().width).toBeCloseTo(sourceBox.width, 1);
        expect(source.getBoundingClientRect().height).toBeCloseTo(sourceBox.height, 1);
        expect(row.getBoundingClientRect().height).toBeCloseTo(rowBox.height, 1);

        if (scenario.finish === "cancel") {
          const line = canvasElement.querySelector<HTMLElement>("[data-wall-move-indicator] > div");
          const scroll = row.closest("main");
          if (line === null || scroll === null) throw new Error("Missing overlay resize fixture");
          const minHeight = target.style.minHeight;
          const scrollTop = scroll.scrollTop;
          try {
            target.style.minHeight = `${rowBox.height + 20}px`;
            await waitFor(() =>
              expect(line.getBoundingClientRect().height).toBeCloseTo(
                row.getBoundingClientRect().height - 4,
                1,
              ),
            );
            scroll.scrollTop += 32;
            await waitFor(() =>
              expect(line.getBoundingClientRect().top).toBeCloseTo(
                row.getBoundingClientRect().top + 4,
                1,
              ),
            );
          } finally {
            target.style.minHeight = minHeight;
            scroll.scrollTop = scrollTop;
          }
          const parent = target.parentElement;
          const next = target.nextSibling;
          if (parent === null) throw new Error("Missing target parent");
          try {
            target.remove();
            await waitFor(() =>
              expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull(),
            );
          } finally {
            parent.insertBefore(target, next);
          }
        }
        if (scenario.finish === "outside") {
          fireEvent.dragOver(document.body, { dataTransfer, clientX: 0, clientY: 0 });
          await waitFor(() =>
            expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull(),
          );
          fireEvent.drop(document.body, { dataTransfer, clientX: 0, clientY: 0 });
        } else if (scenario.finish === "drop") {
          fireEvent.drop(target, { dataTransfer, clientX, clientY });
        }
        fireEvent.dragEnd(handle, { dataTransfer });
        await waitFor(() => {
          expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull();
          expect(getComputedStyle(source).opacity).toBe("1");
          expect(
            Array.from(row.querySelectorAll("[data-wall-placement-id]")).map((element) =>
              element.getAttribute("data-wall-placement-id"),
            ),
          ).toEqual(scenario.order);
        });
        expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(3);
        expect(
          canvasElement
            .querySelector(`[data-wall-row-id="${secondRowId}"] [data-wall-placement-id]`)
            ?.getAttribute("data-wall-placement-id"),
        ).toBe(thirdId);
        expect(
          canvasElement
            .querySelector(".wall-placement.is-selected")
            ?.getAttribute("data-wall-placement-id"),
        ).toBe(firstId);
        for (const content of initialContents) {
          expect(
            canvasElement.querySelector(`[data-wall-placement-id="${content.id}"] .brick-content`)
              ?.innerHTML,
          ).toBe(content.content);
        }
      }

      // Remount each Wall through the ordinary breakpoint control, keeping the same session.
      for (const entry of [...BREAKPOINTS.slice(1), BREAKPOINTS[0]]) {
        await userEvent.click(
          canvas.getByRole("button", { name: `${entry.id} preview, ${entry.previewWidth}px` }),
        );
        const rowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-0`);
        const expectedBricks =
          entry.id === "sm" ? [secondBrickId, firstBrickId] : [firstBrickId, secondBrickId];
        await waitFor(() => {
          const row = canvasElement.querySelector(`[data-wall-row-id="${rowId}"]`);
          expect(
            Array.from(row?.querySelectorAll("[data-wall-placement-id]") ?? []).map((element) =>
              element.getAttribute("data-wall-placement-id"),
            ),
          ).toEqual(expectedBricks.map((id) => makePlacementId(id, entry.id)));
        });
      }
    } finally {
      fireEvent.dragEnd(document.body);
    }
  },
};

export const RowReorderWithGaps: StoryObj<typeof meta> = {
  ...RowReorder,
  args: { selected: true, brickGap: 12, cardStyle: true },
};

/** Saved moves join compatible Rows or create explicit Rows without hover reflow. */
export const CrossRowMoves: StoryObj<typeof meta> = {
  args: { selected: true, brickGap: 0 },
  parameters: {
    docs: {
      description: {
        story:
          "Move the grips across existing Stacks and Sections. Compatible Rows have 8px top/bottom new-Row zones; Article uses top/bottom halves. The play function checks boundary feedback, joins, splitting, singleton no-ops, cancellation, invalidation, selection, and breakpoint isolation through the real local session.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () => expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(5),
      { timeout: 10000 },
    );
    const ids = [0, 1, 2, 3, 4].map((index) =>
      makePlacementId(prefixId(brick, `story-${index}`), "sm"),
    );
    const sourceStackId = prefixId({ abbreviation: "stk" }, "story-sm-source");
    const destinationStackId = prefixId({ abbreviation: "stk" }, "story-sm-destination");
    // Article mounts its Markdown view asynchronously, and remounts it after a move.
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          `[data-wall-placement-id="${ids[4]}"] [aria-label="Article content"]`,
        )?.textContent?.length,
      ).toBeGreaterThan(0),
    );
    const originalContents = Array.from(
      canvasElement.querySelectorAll<HTMLElement>("[data-wall-placement-id]"),
    ).map((element) => {
      const content = element.querySelector(".brick-content");
      if (content === null || content.firstElementChild === null)
        throw new Error("Missing Brick content fixture");
      return {
        id: element.getAttribute("data-wall-placement-id"),
        text: content.textContent,
        images: Array.from(content.querySelectorAll("img")).map((image) => ({
          name: image.getAttribute("alt"),
          source: image.getAttribute("src"),
        })),
        background: getComputedStyle(content.firstElementChild).backgroundColor,
      };
    });

    try {
      for (const scenario of [
        {
          source: 0,
          target: 2,
          y: "top7",
          orientation: "horizontal",
          finish: "cancel",
          createsRow: false,
          members: [0, 1],
          stack: sourceStackId,
        },
        {
          source: 0,
          target: 2,
          y: "top8",
          orientation: "vertical",
          finish: "cancel",
          createsRow: false,
          members: [0, 1],
          stack: sourceStackId,
        },
        {
          source: 0,
          target: 2,
          y: "bottom8",
          orientation: "horizontal",
          finish: "cancel",
          createsRow: false,
          members: [0, 1],
          stack: sourceStackId,
        },
        {
          source: 0,
          target: 2,
          y: "bottom9",
          orientation: "vertical",
          finish: "cancel",
          createsRow: false,
          members: [0, 1],
          stack: sourceStackId,
        },
        {
          source: 0,
          target: 3,
          y: "middle",
          orientation: "vertical",
          finish: "drop",
          createsRow: false,
          members: [0, 3],
          stack: destinationStackId,
        },
        {
          source: 0,
          target: 0,
          y: "top7",
          orientation: "horizontal",
          finish: "drop",
          createsRow: true,
          members: [0],
          stack: destinationStackId,
        },
        {
          source: 0,
          target: 0,
          y: "top7",
          orientation: null,
          finish: "drop",
          createsRow: false,
          members: [0],
          stack: destinationStackId,
        },
        {
          source: 0,
          target: 1,
          y: "bottom1",
          orientation: "horizontal",
          finish: "drop",
          createsRow: true,
          members: [0],
          stack: sourceStackId,
        },
        {
          source: 1,
          target: 2,
          y: "middle",
          orientation: "vertical",
          finish: "drop",
          createsRow: false,
          members: [1, 2],
          stack: sourceStackId,
        },
        {
          source: 4,
          target: 2,
          y: "lower",
          orientation: "horizontal",
          finish: "drop",
          createsRow: true,
          members: [4],
          stack: sourceStackId,
        },
        {
          source: 0,
          target: 4,
          y: "upper",
          orientation: "horizontal",
          finish: "drop",
          createsRow: true,
          members: [0],
          stack: sourceStackId,
        },
        {
          source: 0,
          target: 3,
          y: "middle",
          orientation: "vertical",
          finish: "outside",
          createsRow: false,
          members: [0],
          stack: sourceStackId,
        },
      ]) {
        const source = canvasElement.querySelector<HTMLElement>(
          `[data-wall-placement-id="${ids[scenario.source]}"]`,
        );
        const target = canvasElement.querySelector<HTMLElement>(
          `[data-wall-placement-id="${ids[scenario.target]}"]`,
        );
        const handle = source?.querySelector<HTMLElement>("[data-wall-drag-handle]");
        const sourceRow = source?.closest<HTMLElement>("[data-wall-row-id]");
        const targetRow = target?.closest<HTMLElement>("[data-wall-row-id]");
        if (!source || !target || !handle || !sourceRow || !targetRow)
          throw new Error("Missing cross-Row fixture");
        handle.scrollIntoView({ block: "nearest", inline: "nearest" });
        const handleBox = handle.getBoundingClientRect();
        const sourceBox = source.getBoundingClientRect();
        const rowBox = targetRow.getBoundingClientRect();
        const cellBox = target.getBoundingClientRect();
        const sourceRowId = sourceRow.getAttribute("data-wall-row-id");
        const targetRowId = targetRow.getAttribute("data-wall-row-id");
        const beforeGroups = Array.from(canvasElement.querySelectorAll("[data-wall-row-id]")).map(
          (row) => ({
            id: row.getAttribute("data-wall-row-id"),
            ids: Array.from(row.querySelectorAll("[data-wall-placement-id]")).map((cell) =>
              cell.getAttribute("data-wall-placement-id"),
            ),
          }),
        );
        const clientX = cellBox.left + cellBox.width / 4;
        const clientY =
          scenario.y === "top7"
            ? rowBox.top + 7
            : scenario.y === "top8"
              ? rowBox.top + 8
              : scenario.y === "bottom8"
                ? rowBox.bottom - 8
                : scenario.y === "bottom9"
                  ? rowBox.bottom - 9
                  : scenario.y === "bottom1"
                    ? rowBox.bottom - 1
                    : scenario.y === "upper"
                      ? rowBox.top + rowBox.height / 4
                      : scenario.y === "lower"
                        ? rowBox.top + (rowBox.height * 3) / 4
                        : rowBox.top + rowBox.height / 2;
        const dataTransfer = new DataTransfer();
        fireEvent.dragStart(handle, {
          dataTransfer,
          clientX: handleBox.left + handleBox.width / 2,
          clientY: handleBox.top + handleBox.height / 2,
        });
        await waitFor(() => expect(getComputedStyle(source).opacity).toBe("0.4"));
        fireEvent.dragOver(target, { dataTransfer, clientX, clientY });
        await waitFor(() => {
          const indicator = canvasElement.querySelector<HTMLElement>("[data-wall-move-indicator]");
          if (scenario.orientation === null) expect(indicator).toBeNull();
          else {
            if (!indicator) throw new Error("Missing cross-Row insertion line");
            const line = indicator.firstElementChild;
            if (!(line instanceof HTMLElement)) throw new Error("Missing Wall drop indicator");
            const lineBox = line.getBoundingClientRect();
            expect(indicator.getAttribute("data-orientation")).toBe(scenario.orientation);
            expect(getComputedStyle(indicator).pointerEvents).toBe("none");
            expect(getComputedStyle(line).backgroundColor).toBe("rgb(255, 255, 255)");
            expect(getComputedStyle(line).boxShadow).toBe("rgb(24, 104, 219) 0px 0px 0px 1px");
            expect(getComputedStyle(line, "::before").backgroundColor).toBe("rgb(255, 255, 255)");
            expect(getComputedStyle(line, "::before").borderWidth).toBe("1px");
            if (scenario.orientation === "vertical") {
              expect(lineBox.width).toBeCloseTo(1, 1);
              expect(lineBox.height).toBeCloseTo(rowBox.height - 4, 1);
            } else {
              expect(lineBox.height).toBeCloseTo(1, 1);
              expect(lineBox.width).toBeCloseTo(rowBox.width - 4, 1);
              expect(lineBox.top + lineBox.height / 2).toBeCloseTo(
                clientY < rowBox.top + rowBox.height / 2 ? rowBox.top : rowBox.bottom,
                1,
              );
            }
          }
        });
        expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull();
        expect(source.getBoundingClientRect().width).toBeCloseTo(sourceBox.width, 1);
        expect(source.getBoundingClientRect().height).toBeCloseTo(sourceBox.height, 1);
        expect(targetRow.getBoundingClientRect().height).toBeCloseTo(rowBox.height, 1);
        expect(
          Array.from(canvasElement.querySelectorAll("[data-wall-row-id]")).map((row) => ({
            id: row.getAttribute("data-wall-row-id"),
            ids: Array.from(row.querySelectorAll("[data-wall-placement-id]")).map((cell) =>
              cell.getAttribute("data-wall-placement-id"),
            ),
          })),
        ).toEqual(beforeGroups);

        if (scenario.finish === "outside") {
          fireEvent.dragOver(document.body, { dataTransfer, clientX: 0, clientY: 0 });
          fireEvent.drop(document.body, { dataTransfer, clientX: 0, clientY: 0 });
        } else if (scenario.finish === "drop")
          fireEvent.drop(target, { dataTransfer, clientX, clientY });
        fireEvent.dragEnd(handle, { dataTransfer });
        await waitFor(() => {
          expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull();
          expect(canvasElement.querySelector("[data-wall-moving]")).toBeNull();
          const moved = canvasElement.querySelector(
            `[data-wall-placement-id="${ids[scenario.source]}"]`,
          );
          const row = moved?.closest("[data-wall-row-id]");
          expect(
            Array.from(row?.querySelectorAll("[data-wall-placement-id]") ?? []).map((cell) =>
              cell.getAttribute("data-wall-placement-id"),
            ),
          ).toEqual(scenario.members.map((index) => ids[index]));
          expect(moved?.closest("[data-wall-stack-id]")?.getAttribute("data-wall-stack-id")).toBe(
            scenario.stack,
          );
          if (scenario.createsRow)
            expect(row?.getAttribute("data-wall-row-id")).not.toBe(sourceRowId);
          else
            expect(row?.getAttribute("data-wall-row-id")).toBe(
              scenario.finish === "drop" && scenario.orientation !== null
                ? targetRowId
                : sourceRowId,
            );
        });
        expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(5);
        expect(
          canvasElement
            .querySelector(".wall-placement.is-selected")
            ?.getAttribute("data-wall-placement-id"),
        ).toBe(ids[0]);
        for (const saved of originalContents) {
          await waitFor(() => {
            const content = canvasElement.querySelector(
              `[data-wall-placement-id="${saved.id}"] .brick-content`,
            );
            if (content === null || content.firstElementChild === null)
              throw new Error("Missing moved Brick content");
            // Preserve the rendered content, allowing responsive image attributes and editor scaffolding to remount.
            expect(content.textContent).toBe(saved.text);
            expect(
              Array.from(content.querySelectorAll("img")).map((image) => ({
                name: image.getAttribute("alt"),
                source: image.getAttribute("src"),
              })),
            ).toEqual(saved.images);
            expect(getComputedStyle(content.firstElementChild).backgroundColor).toBe(
              saved.background,
            );
          });
        }
      }

      // Replacing the mounted Wall invalidates the source and all destination elements.
      const source = canvasElement.querySelector<HTMLElement>(
        `[data-wall-placement-id="${ids[0]}"]`,
      );
      const target = canvasElement.querySelector<HTMLElement>(
        `[data-wall-placement-id="${ids[3]}"]`,
      );
      const handle = source?.querySelector<HTMLElement>("[data-wall-drag-handle]");
      if (!source || !target || !handle) throw new Error("Missing invalidation fixture");
      const sourceGroups = Array.from(canvasElement.querySelectorAll("[data-wall-row-id]")).map(
        (row) => ({
          id: row.getAttribute("data-wall-row-id"),
          ids: Array.from(row.querySelectorAll("[data-wall-placement-id]")).map((cell) =>
            cell.getAttribute("data-wall-placement-id"),
          ),
        }),
      );
      handle.scrollIntoView({ block: "nearest", inline: "nearest" });
      const handleBox = handle.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(handle, {
        dataTransfer,
        clientX: handleBox.left + 14,
        clientY: handleBox.top + 14,
      });
      fireEvent.dragOver(target, {
        dataTransfer,
        clientX: targetBox.left + 2,
        clientY: targetBox.top + targetBox.height / 2,
      });
      await waitFor(() =>
        expect(canvasElement.querySelector("[data-wall-move-indicator]")).not.toBeNull(),
      );
      await userEvent.click(canvas.getByRole("button", { name: "md preview, 720px" }));
      fireEvent.dragEnd(document.body);
      await waitFor(() =>
        expect(canvasElement.querySelector(`[data-wall-row-id="row_story-md-0"]`)).not.toBeNull(),
      );
      expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull();
      expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(5);
      expect(
        Array.from(
          canvasElement
            .querySelector('[data-wall-row-id="row_story-md-0"]')
            ?.querySelectorAll("[data-wall-placement-id]") ?? [],
        ).map((cell) => cell.getAttribute("data-wall-placement-id")),
      ).toEqual([0, 1].map((index) => makePlacementId(prefixId(brick, `story-${index}`), "md")));
      await userEvent.click(canvas.getByRole("button", { name: "sm preview, 360px" }));
      await waitFor(() =>
        expect(
          Array.from(canvasElement.querySelectorAll("[data-wall-row-id]")).map((row) => ({
            id: row.getAttribute("data-wall-row-id"),
            ids: Array.from(row.querySelectorAll("[data-wall-placement-id]")).map((cell) =>
              cell.getAttribute("data-wall-placement-id"),
            ),
          })),
        ).toEqual(sourceGroups),
      );
    } finally {
      fireEvent.dragEnd(document.body);
    }
  },
};

export const CrossRowMovesWithGaps: StoryObj<typeof meta> = {
  ...CrossRowMoves,
  args: { selected: true, brickGap: 12, cardStyle: true },
};

export const CrossRowEmptyRow: StoryObj<typeof meta> = {
  args: { selected: true },
  play: async ({ canvasElement, id }) => {
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    const sourceId = makePlacementId(prefixId(brick, "story-0"), "sm");
    const stackDestination = id.endsWith("--cross-row-empty-stack");
    const selector = stackDestination
      ? '[data-wall-stack-id="stk_story-sm-empty"]'
      : '[data-wall-row-id="row_story-sm-empty"]';
    await waitFor(() => expect(canvasElement.querySelector(selector)).not.toBeNull(), {
      timeout: 10000,
    });
    const source = canvasElement.querySelector<HTMLElement>(
      `[data-wall-placement-id="${sourceId}"]`,
    );
    const handle = source?.querySelector<HTMLElement>("[data-wall-drag-handle]");
    const target = canvasElement.querySelector<HTMLElement>(selector);
    if (!source || !handle || !target) throw new Error("Missing empty destination fixture");
    handle.scrollIntoView({ block: "nearest", inline: "nearest" });
    const handleBox = handle.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    const clientX = targetBox.left + targetBox.width / 2;
    const clientY = targetBox.top + targetBox.height / 2;
    try {
      fireEvent.dragStart(handle, {
        dataTransfer,
        clientX: handleBox.left + 14,
        clientY: handleBox.top + 14,
      });
      fireEvent.dragOver(target, { dataTransfer, clientX, clientY });
      await waitFor(() =>
        expect(
          canvasElement
            .querySelector("[data-wall-move-indicator]")
            ?.getAttribute("data-orientation"),
        ).toBe(stackDestination ? "horizontal" : "vertical"),
      );
      expect(target.getBoundingClientRect().height).toBeCloseTo(targetBox.height, 1);
      expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull();
      fireEvent.drop(target, { dataTransfer, clientX, clientY });
      fireEvent.dragEnd(handle, { dataTransfer });
      await waitFor(() => {
        const moved = canvasElement.querySelector(`[data-wall-placement-id="${sourceId}"]`);
        expect(
          moved
            ?.closest(stackDestination ? "[data-wall-stack-id]" : "[data-wall-row-id]")
            ?.getAttribute(stackDestination ? "data-wall-stack-id" : "data-wall-row-id"),
        ).toBe(stackDestination ? "stk_story-sm-empty" : "row_story-sm-empty");
        expect(
          moved?.closest("[data-wall-row-id]")?.querySelectorAll("[data-wall-placement-id]"),
        ).toHaveLength(1);
        expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull();
      });
      expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(5);
      expect(
        canvasElement
          .querySelector(".wall-placement.is-selected")
          ?.getAttribute("data-wall-placement-id"),
      ).toBe(sourceId);
    } finally {
      fireEvent.dragEnd(document.body);
    }
  },
};

export const CrossRowEmptyStack: StoryObj<typeof meta> = {
  ...CrossRowEmptyRow,
};

export const CrossRowStickyActions: StoryObj<typeof meta> = {
  args: { selected: true, stickyNavbar: true },
  play: async ({ canvasElement, args }) => {
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector('[aria-label="Article content"]')?.textContent?.length,
        ).toBeGreaterThan(0),
      { timeout: 10000 },
    );
    const article = canvasElement
      .querySelector<HTMLElement>('[data-wall-placement-id] [aria-label="Article content"]')
      ?.closest<HTMLElement>("[data-wall-placement-id]");
    const stack = article?.closest<HTMLElement>("[data-wall-stack-id]");
    const scroll = article?.closest("main");
    const content = article?.querySelector<HTMLElement>(".wall-placement-content");
    const brickActions = article?.querySelector<HTMLElement>(".brick-action");
    const stackActions = stack?.querySelector<HTMLElement>(".stack-action");
    const brickHost = brickActions?.parentElement;
    const handle = article?.querySelector<HTMLElement>("[data-wall-drag-handle]");
    const tail = canvasElement.querySelector<HTMLElement>(
      '[data-wall-stack-id="stk_story-sm-empty"]',
    );
    const previewActions = canvasElement.querySelector("[data-drawer-module-id] .brick-action");
    const chrome = canvasElement.querySelector(".wall-preview-chrome");
    const navbar = canvasElement.querySelector(".wall-preview-frame header");
    if (
      !article ||
      !stack ||
      !scroll ||
      !content ||
      !brickActions ||
      !brickHost ||
      !stackActions ||
      !handle ||
      !tail ||
      !chrome ||
      !navbar ||
      !previewActions
    )
      throw new Error("Missing sticky action fixture");
    const originalBox = article.getBoundingClientRect();
    const originalScroll = scroll.scrollTop;
    const tailHeight = tail.style.minHeight;
    const offset =
      (args.stickyNavbar ? 7 : 3) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    try {
      // Leave enough content below the owner to scroll its bottom past the sticky edge.
      tail.style.minHeight = `${scroll.clientHeight}px`;
      handle.focus({ preventScroll: true });
      scroll.scrollTop += originalBox.top - scroll.getBoundingClientRect().top - offset + 80;
      await waitFor(() => {
        const top = args.stickyNavbar
          ? navbar.getBoundingClientRect().bottom
          : chrome.getBoundingClientRect().bottom;
        expect(brickActions.getBoundingClientRect().top).toBeCloseTo(top, 1);
        expect(stackActions.getBoundingClientRect().top).toBeCloseTo(top, 1);
        expect(article.getBoundingClientRect().width).toBeCloseTo(originalBox.width, 1);
        expect(article.getBoundingClientRect().height).toBeCloseTo(originalBox.height, 1);
        expect(getComputedStyle(brickHost).pointerEvents).toBe("none");
        expect(getComputedStyle(brickActions).pointerEvents).toBe("auto");
        expect(getComputedStyle(previewActions).position).toBe("absolute");
      });
      await userEvent.click(
        within(stack).getByRole("button", { name: "Stack Destination stack actions" }),
      );
      expect(within(document.body).getByRole("menuitem", { name: "Insert left" })).toBeVisible();
      expect(within(document.body).getByRole("menuitem", { name: "Insert right" })).toBeVisible();
      await userEvent.keyboard("{Escape}");
      await userEvent.click(
        within(article).getByRole("button", { name: "Brick brk_story-4 actions" }),
      );
      expect(within(document.body).getByRole("menuitem", { name: "Delete Brick" })).toBeVisible();
      await userEvent.keyboard("{Escape}");
      scroll.scrollTop +=
        content.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top - offset - 14;
      await waitFor(() => {
        expect(brickActions.getBoundingClientRect().bottom).toBeCloseTo(
          content.getBoundingClientRect().bottom - 1,
          1,
        );
        expect(brickActions.getBoundingClientRect().top).toBeLessThan(
          args.stickyNavbar
            ? navbar.getBoundingClientRect().bottom
            : chrome.getBoundingClientRect().bottom,
        );
      });
      scroll.scrollTop +=
        stack.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top - offset - 14;
      await waitFor(() =>
        expect(stackActions.getBoundingClientRect().bottom).toBeCloseTo(
          stack.getBoundingClientRect().bottom - 1,
          1,
        ),
      );
    } finally {
      tail.style.minHeight = tailHeight;
      scroll.scrollTop = originalScroll;
    }
  },
};

export const CrossRowStickyActionsWithoutNavbar: StoryObj<typeof meta> = {
  ...CrossRowStickyActions,
  args: { ...CrossRowStickyActions.args, stickyNavbar: false },
};
