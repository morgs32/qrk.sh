import { makePlacementId } from "@qrk.sh/zerospin/src/modules/lib/makePlacementId";
import { prefixId } from "@zerospin/sdk/browser";
import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import wallEditorMeta from "../../WallEditor.stories";

const { brick } = userSessionDefinition.models;

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

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
            expect(getComputedStyle(line).boxShadow).toBe(
              "rgb(24, 104, 219) 0px 0px 0px 1px, rgb(139, 180, 237) 0px 0px 0px 2px",
            );
            expect(getComputedStyle(line, "::before").backgroundColor).toBe("rgb(255, 255, 255)");
            expect(getComputedStyle(line, "::before").borderWidth).toBe("1px");
            expect(getComputedStyle(line, "::before").boxShadow).toBe(
              "rgb(139, 180, 237) 0px 0px 0px 1px",
            );
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
