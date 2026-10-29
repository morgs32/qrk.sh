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
  } = props;
  const [resources] = useState(() =>
    makeResources(emptyWall, brickGap, stickyNavbar, borderWidth, cardStyle, fixture),
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
            <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900 antialiased">
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
                        <p className="text-xs text-zinc-500">Drag a brick onto your page</p>
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
  render: function Render(props: {
    emptyWall: boolean;
    brickGap: number;
    stickyNavbar: boolean;
    borderWidth: number;
    cardStyle: boolean;
    verticalAtLg: boolean;
    fixture: "default" | "swatch-and-icon" | "article";
    selected: boolean;
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
    } = props;
    return (
      <WallEditorStory
        key={`${emptyWall}-${brickGap}-${stickyNavbar}-${borderWidth}-${cardStyle}-${fixture}-${selected}`}
        emptyWall={emptyWall}
        brickGap={brickGap}
        stickyNavbar={stickyNavbar}
        borderWidth={borderWidth}
        cardStyle={cardStyle}
        verticalAtLg={verticalAtLg}
        fixture={fixture}
        selected={selected}
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

/** Same content and width through the real catalog and Wall render paths. */
export const PreviewBrick: StoryObj<typeof meta> = {
  args: { fixture: "swatch-and-icon" },
  parameters: {
    docs: {
      description: {
        story:
          "Compare the catalog and placed content at the same width. Choose Swatch and Icon or Article with fixture; use cardStyle, brickGap, borderWidth, and the breakpoint buttons for the size checks. Hover and keyboard focus decorate the content without resizing it.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    await canvasElement.ownerDocument.fonts.ready;
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
    const action = within(source).getByRole("button", { name: "Preview brick action" });
    if (surface === null) throw new Error("Missing catalog Brick surface");
    const before = surface.getBoundingClientRect();
    // Compare content boxes: Wall padding is the intentional Brick gap.
    expect(before.width).toBeCloseTo(placed.getBoundingClientRect().width, 1);
    expect(before.height).toBeCloseTo(placed.getBoundingClientRect().height, 1);
    action.focus();
    expect(source.matches(":focus-within")).toBe(true);
    expect(surface.getBoundingClientRect().width).toBeCloseTo(before.width, 1);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    action.blur();
  },
};

/** Selection belongs to the Wall; focus remains independent of it. */
export const PlacementBrick: StoryObj<typeof meta> = {
  args: { fixture: "swatch-and-icon" },
  parameters: {
    docs: {
      description: {
        story:
          "Toggle Selected placement without focusing the Brick, then hover or tab into its actions. The content box and the gap-padded hitbox keep their dimensions in every state.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    await canvasElement.ownerDocument.fonts.ready;
    await waitFor(
      () => expect(canvasElement.querySelector("[data-wall-placement-id]")).not.toBeNull(),
      { timeout: 10000 },
    );
    const placementElement = canvasElement.querySelector<HTMLElement>("[data-wall-placement-id]");
    const surface = placementElement?.querySelector<HTMLElement>(".brick-hover-surface");
    if (placementElement === null || surface === null || surface === undefined)
      throw new Error("Missing placed Brick fixture");
    const before = surface.getBoundingClientRect();
    const hitbox = placementElement.getBoundingClientRect();
    // Half-gap padding on each side adds exactly one configured gap.
    expect(hitbox.width - before.width).toBeCloseTo(args.brickGap, 1);
    expect(hitbox.height - before.height).toBeCloseTo(args.brickGap, 1);
    const selectedControl = within(canvasElement).getByRole("checkbox", {
      name: "Selected placement",
    });
    await userEvent.click(selectedControl);
    expect(placementElement.classList.contains("is-selected")).toBe(!args.selected);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    expect(surface.getBoundingClientRect().width).toBeCloseTo(before.width, 1);
    const action = within(placementElement).getByRole("button", { name: /Brick .* actions/ });
    action.focus();
    expect(placementElement.matches(":focus-within")).toBe(true);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    expect(placementElement.getBoundingClientRect().height).toBeCloseTo(hitbox.height, 1);
    action.blur();
  },
};

/** Leave the production insertion shadow visible without executing a drop. */
export const ShadowBrick: StoryObj<typeof meta> = {
  args: { fixture: "swatch-and-icon" },
  beforeEach: ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      // Synthetic drags need the dragend that a native Escape would dispatch.
      if (event.key === "Escape") fireEvent.dragEnd(document.body);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Cancel before changing args or stories so no drag lifecycle leaks.
      fireEvent.dragEnd(document.body);
    };
  },
  parameters: {
    docs: {
      description: {
        story:
          "The play function checks every breakpoint, then leaves the sm insertion shadow visible in a new Row at the same available width. Use emptyWall for Article because it permits only one per page. The shadow has 40% opacity and no added edge. Press Escape to cancel; no drop is performed.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    await canvasElement.ownerDocument.fonts.ready;
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
      fireEvent.dragEnd(canvasElement.ownerDocument.body);
      await waitFor(() =>
        expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull(),
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
      if (source === null || target === null) throw new Error("Missing shadow Brick fixture");
      source.scrollIntoView({ block: "nearest", inline: "nearest" });
      const sourceSurface = source.querySelector<HTMLElement>(".brick-hover-surface");
      if (sourceSurface === null) throw new Error("Missing shadow source surface");
      const before = placed?.getBoundingClientRect();
      const sourceBox = sourceSurface.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      fireEvent.dragStart(source, {
        dataTransfer,
        clientX: sourceBox.x + 8,
        clientY: sourceBox.y + 8,
      });
      await waitFor(() => expect(source.classList.contains("opacity-40")).toBe(true));
      // Pragmatic DnD publishes drag start on the next animation frame.
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
      if (shadow === null || shadowSurface === null || shadowSurface === undefined)
        throw new Error("Missing insertion shadow surface");
      // The shadow follows content height; padding contributes only the configured gap.
      expect(shadowSurface.getBoundingClientRect().width).toBeCloseTo(sourceBox.width, 1);
      expect(shadowSurface.getBoundingClientRect().height).toBeCloseTo(sourceBox.height, 1);
      expect(
        shadow.getBoundingClientRect().height - shadowSurface.getBoundingClientRect().height,
      ).toBeCloseTo(args.brickGap, 1);
      if (placed !== null && placed !== undefined && before !== undefined)
        expect(placed.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
      expect(getComputedStyle(shadow).opacity).toBe("0.4");
      expect(getComputedStyle(shadow, "::after").content).toBe("none");
    }
  },
};
