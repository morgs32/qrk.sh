import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../modules/modulesHash";
import wallEditorMeta from "../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

/** Module-sized catalog content and a stretched Wall placement share their appearance. */
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
    if (args.fixture === "default") throw new Error("Choose a concrete Brick fixture");
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            `[data-catalog-module-id="${args.fixture}"][draggable="true"]`,
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    const source = canvasElement.querySelector<HTMLElement>(
      `[data-catalog-module-id="${args.fixture}"]`,
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
    // The singleton uses the same preferred width, capped by its Stack.
    const variant = modulesHash[args.fixture].variants.default;
    expect(before.width).toBeCloseTo(variant.defaultWidth, 1);
    expect(placed.getBoundingClientRect().width).toBeCloseTo(
      Math.min(BREAKPOINTS[0].previewWidth, variant.defaultWidth),
      1,
    );
    if (variant.defaultHeight !== null) {
      expect(placed.getBoundingClientRect().height).toBeCloseTo(variant.defaultHeight, 1);
    }
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
          "The play function checks focus, selection while focus is elsewhere, and module-owned edit surfaces. Pointer hover remains available for direct inspection; selection alone does not reveal action tabs.",
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
    const placedBrick = within(placementElement);
    const focusTarget =
      args.fixture === "article"
        ? placedBrick.getByRole("textbox", { name: "Article title" })
        : placedBrick.getByRole("group", { name: "Edit Swatch and Icon" });
    focusTarget.focus();
    await waitFor(() => expect(getComputedStyle(actions).opacity).toBe("1"));
    expect(getComputedStyle(actions).backgroundColor).toBe("rgb(31, 155, 252)");
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    await userEvent.click(focusTarget);
    expect(placedBrick.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(focusTarget);
    expect(surface.getBoundingClientRect().width).toBeCloseTo(before.width, 1);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(before.height, 1);
    expect(placementElement.getBoundingClientRect().height).toBeCloseTo(hitbox.height, 1);
    // Leave selection visible while focus sits outside the Brick.
    selectedControl.focus();
    expect(getComputedStyle(surface, "::after").opacity).toBe("1");
  },
};
