import { MockAggregateSession } from "@zerospin/react";
import { prefixId } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
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
import { UserUI } from "@/zerospin/UserUI";
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
) {
  const timestamps = {
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    updatedAt: new Date("2026-10-20T00:00:00.000Z"),
  };
  const bricks = emptyWall
    ? []
    : (fixture === "default" ? [0, 1, 2] : [0]).map((position) =>
        Schema.decodeUnknownSync(Schema.toType(brick.resourceJsonCodec))({
          ...timestamps,
          modelName: brick.modelName,
          version: brick.version,
          id: prefixId(brick, `story-${position}`),
          pageId,
          moduleId: fixture === "default" ? "swatch-and-icon" : fixture,
          borderWidth,
          stateRevision: 0,
          state:
            fixture === "default"
              ? {
                  ...swatchAndIconV1.defaultState,
                  payload: { hash: "", color: ["#4A7C59", "#D4A373", "#577590"][position] },
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
          spec: modulesHash[fixture === "default" ? "swatch-and-icon" : fixture].variants.default
            .spec,
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

  return (
    <MockAggregateSession
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
          </UserUI>
        ) : (
          <p role="status">Opening local session…</p>
        )
      }
    </MockAggregateSession>
  );
}

const meta = {
  title: "App/Studio/Wall Editor",
  parameters: { layout: "fullscreen" },
  args: {
    emptyWall: false,
    brickGap: 1,
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
    const populatedFixture =
      context.id.endsWith("--preview-brick") || context.id.endsWith("--placement-brick");
    return (
      <WallEditorStory
        key={`${emptyWall}-${brickGap}-${stickyNavbar}-${borderWidth}-${cardStyle}-${fixture}-${selected}-${shadowFixture}`}
        emptyWall={populatedFixture ? false : emptyWall}
        brickGap={brickGap}
        stickyNavbar={stickyNavbar}
        borderWidth={borderWidth}
        cardStyle={cardStyle}
        verticalAtLg={verticalAtLg}
        fixture={fixture}
        selected={selected}
        shadowFixture={shadowFixture}
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
