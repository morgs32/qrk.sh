import { prefixId } from "@zerospin/sdk/browser";
import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../modules/modulesHash";
import wallEditorMeta from "../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  tags: ["!dev"],
  id: "app-studio-wall-editor",
};

export default meta;

/** Mixed-height Bricks share one content-sized Row before and after command-backed drops. */
export const EqualHeightRows: StoryObj<typeof meta> = {
  args: { brickGap: 0, cardStyle: false },
  parameters: {
    docs: {
      description: {
        story:
          "At each breakpoint, a taller Figma shadow grows a Swatch Row and stretches its visible surface. Leaving restores the original height. A real drop keeps both Bricks equal; a shorter Swatch shadow fills that Row. Figma uses static example content and its module-owned placeholder, without a provider request.",
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector(
            '[data-catalog-module-id="figma-thumbnail"][draggable="true"]',
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
        '[data-catalog-module-id="figma-thumbnail"]',
      );
      const shortSource = canvasElement.querySelector<HTMLElement>(
        '[data-catalog-module-id="swatch-and-icon"]',
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
        if (entry.id === "sm") {
          // A taller Brick still needs its minimum width; rejection must not append a Row.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          expect(row.querySelector(".wall-shadow-placeholder")).toBeNull();
          fireEvent.drop(placed, { dataTransfer: tallDataTransfer, clientX, clientY });
          fireEvent.dragEnd(tallSource, { dataTransfer: tallDataTransfer });
          expect(row.querySelectorAll("[data-wall-placement-id]")).toHaveLength(1);
          expect(canvasElement.querySelectorAll("[data-wall-placement-id]")).toHaveLength(
            initialPlacementCount,
          );
          continue;
        }
        await waitFor(() => {
          const shadow = row.querySelector<HTMLElement>(".wall-shadow-placeholder");
          const shadowSurface = shadow?.querySelector<HTMLElement>(".brick-hover-surface");
          if (!shadow || !shadowSurface) throw new Error("Missing taller insertion shadow");
          expect(surface.getBoundingClientRect().width).toBeGreaterThanOrEqual(
            modulesHash["swatch-and-icon"].variants.default.minWidth,
          );
          expect(shadowSurface.getBoundingClientRect().width).toBeGreaterThanOrEqual(
            modulesHash["figma-thumbnail"].variants.default.minWidth,
          );
          expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
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
