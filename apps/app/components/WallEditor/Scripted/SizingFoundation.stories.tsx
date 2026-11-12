import { prefixId } from "@zerospin/sdk/browser";
import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { BREAKPOINTS } from "../../../lib/breakpoints";
import wallEditorMeta from "../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  tags: ["!dev"],
  id: "app-studio-wall-editor",
};

export default meta;

/** Persisted preferences control proportions and minimums without limiting content. */
export const SizingFoundation: StoryObj<typeof meta> = {
  args: { brickGap: 0, cardStyle: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    await document.fonts.ready;
    await canvas.findByRole("button", { name: "sm preview, 360px" }, { timeout: 10000 });
    for (const entry of BREAKPOINTS) {
      await userEvent.click(
        canvas.getByRole("button", { name: `${entry.id} preview, ${entry.previewWidth}px` }),
      );
      const rowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-0`);
      await waitFor(() => {
        const row = canvasElement.querySelector<HTMLElement>(`[data-wall-row-id="${rowId}"]`);
        const line = row?.querySelector<HTMLElement>("[data-wall-row-content]");
        const placements = Array.from(
          row?.querySelectorAll<HTMLElement>("[data-wall-placement-id]") ?? [],
        );
        if (!row || !line || placements.length !== 2) throw new Error("Missing sizing Row");
        const surfaces = placements.map((placement) =>
          placement.querySelector<HTMLElement>(".brick-hover-surface"),
        );
        const first = surfaces[0];
        const second = surfaces[1];
        if (!first || !second) throw new Error("Missing sizing surfaces");
        const firstBox = first.getBoundingClientRect();
        const secondBox = second.getBoundingClientRect();
        const lineBox = line.getBoundingClientRect();
        expect(placements[0].getBoundingClientRect().left).toBeCloseTo(lineBox.left + 0.5, 1);
        const expectedGroupWidth = Math.min(entry.previewWidth, 720 + args.brickGap);
        expect(secondBox.right - firstBox.left).toBeCloseTo(expectedGroupWidth, 1);
        expect(firstBox.width).toBeGreaterThanOrEqual(159.9);
        expect(secondBox.width).toBeGreaterThanOrEqual(159.9);
        expect(secondBox.left - firstBox.right).toBeCloseTo(args.brickGap, 1);
        if (firstBox.width + secondBox.width >= 480) {
          expect(firstBox.width / secondBox.width).toBeCloseTo(2, 1);
        }
        expect(firstBox.height).toBeCloseTo(90, 1);
        expect(secondBox.height).toBeCloseTo(firstBox.height, 1);

        const minimumRowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-1`);
        const minimumSurface = canvasElement.querySelector<HTMLElement>(
          `[data-wall-row-id="${minimumRowId}"] .brick-hover-surface`,
        );
        const contentRowId = prefixId({ abbreviation: "row" }, `story-${entry.id}-2`);
        const contentSurface = canvasElement.querySelector<HTMLElement>(
          `[data-wall-row-id="${contentRowId}"] .brick-hover-surface`,
        );
        if (!minimumSurface || !contentSurface) throw new Error("Missing height fixtures");
        expect(minimumSurface.getBoundingClientRect().height).toBeCloseTo(360, 1);
        expect(contentSurface.getBoundingClientRect().height).toBeGreaterThan(360);
      });
    }
  },
};

export const SizingFoundationWithGaps: StoryObj<typeof meta> = {
  ...SizingFoundation,
  args: { brickGap: 12, cardStyle: true },
};
