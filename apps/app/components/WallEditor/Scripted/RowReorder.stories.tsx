import { makePlacementId } from "@qrk.sh/zerospin/src/aggregates/user/layout/makePlacementId";
import { prefixId } from "@zerospin/sdk/browser";
import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { BREAKPOINTS } from "../../../lib/breakpoints";
import wallEditorMeta from "../WallEditor.stories";

const { brick } = userSessionDefinition.models;

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

/** Saved Placement moves use commands while keeping their Row's geometry fixed. */
export const RowReorder: StoryObj<typeof meta> = {
  args: { selected: true, brickGap: 0 },
  parameters: {
    docs: {
      description: {
        story:
          "Drag the grip beside a Brick's edit button to reorder it within its Row. The play function verifies forward/backward movement, append, unchanged drops, cancellation, outside drops, stable geometry, retained selection, and unchanged breakpoint Walls against the real local session.",
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
            expect(getComputedStyle(line).boxShadow).toBe(
              "rgb(24, 104, 219) 0px 0px 0px 1px, rgb(139, 180, 237) 0px 0px 0px 2px",
            );
            expect(getComputedStyle(line, "::before").backgroundColor).toBe("rgb(255, 255, 255)");
            expect(getComputedStyle(line, "::before").borderWidth).toBe("1px");
            expect(getComputedStyle(line, "::before").boxShadow).toBe(
              "rgb(139, 180, 237) 0px 0px 0px 1px",
            );
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
