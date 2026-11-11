import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../modules/modulesHash";
import wallEditorMeta from "../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

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
        `[data-catalog-module-id="${args.fixture}"]`,
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
      expect(nativeCopy.getBoundingClientRect().width).toBeCloseTo(sourceBox.width, 1);
      expect(nativeCopy.getBoundingClientRect().height).toBeCloseTo(sourceBox.height, 1);
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
      const variant = modulesHash[args.fixture].variants.default;
      expect(shadowSurface.getBoundingClientRect().width).toBeCloseTo(
        Math.min(entry.previewWidth, variant.defaultWidth),
        1,
      );
      expect(shadowSurface.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        Math.max(45, variant.minHeight ?? 45, variant.defaultHeight ?? 45),
      );
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

      if (entry.id === "sm" && args.emptyWall) {
        const shadowBox = shadowSurface.getBoundingClientRect();
        fireEvent.drop(shadow, {
          dataTransfer,
          clientX: shadowBox.x + shadowBox.width / 2,
          clientY: shadowBox.y + shadowBox.height / 2,
        });
        fireEvent.dragEnd(source, { dataTransfer });
        await waitFor(() => {
          const committed = canvasElement.querySelector<HTMLElement>(
            "[data-wall-placement-id] .brick-hover-surface",
          );
          if (!committed) throw new Error("Missing committed empty-Wall Brick");
          expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(1);
          expect(canvasElement.querySelector(".wall-shadow-placeholder")).toBeNull();
          expect(committed.getBoundingClientRect().width).toBeCloseTo(shadowBox.width, 1);
          expect(committed.getBoundingClientRect().height).toBeCloseTo(shadowBox.height, 1);
        });
      }

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

export const ShadowBrickEmptyWallWithGaps: StoryObj<typeof meta> = {
  ...ShadowBrick,
  play: ShadowBrick.play,
  args: { fixture: "swatch-and-icon", emptyWall: true, brickGap: 12, cardStyle: true },
  parameters: {
    docs: {
      description: {
        story:
          "Checks an empty Wall's insertion shadow at every breakpoint with a gap, then drops at sm and verifies that the committed visible surface matches the preview geometry.",
      },
    },
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
            '[data-catalog-module-id="swatch-and-icon"][draggable="true"]',
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    const source = canvasElement.querySelector<HTMLElement>(
      '[data-catalog-module-id="swatch-and-icon"]',
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
