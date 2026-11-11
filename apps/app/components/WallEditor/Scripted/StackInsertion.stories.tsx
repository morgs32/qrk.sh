import { makePlacementId } from "@qrk.sh/zerospin/src/aggregates/user/layout/makePlacementId";
import { prefixId } from "@zerospin/sdk/browser";
import type { StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";

import { BREAKPOINTS } from "../../../lib/breakpoints";
import wallEditorMeta from "../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

/** Stack menus use real command validation and render constrained automatic widths. */
export const StackInsertion: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const body = within(document.body);
    await canvas.findByRole("button", { name: "sm preview, 360px" }, { timeout: 10000 });
    for (const entry of BREAKPOINTS) {
      await userEvent.click(
        canvas.getByRole("button", {
          name: `${entry.id} preview, ${entry.previewWidth}px`,
        }),
      );
      const originalId = prefixId({ abbreviation: "stk" }, `story-${entry.id}`);
      const original = canvasElement.querySelector<HTMLElement>(
        `[data-wall-stack-id="${originalId}"]`,
      );
      const section = original?.closest<HTMLElement>("[data-wall-section-id]");
      if (!original || !section) throw new Error("Missing Stack insertion fixture");
      const availableWidth = entry.previewWidth + args.brickGap;
      const originalMinimum = 2 * (160 + args.brickGap);
      const maximumStacks =
        1 + Math.floor((availableWidth - originalMinimum) / (160 + args.brickGap));
      for (let count = 1; count <= maximumStacks; count += 1) {
        await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
        await userEvent.click(
          within(original).getByRole("button", { name: "Stack Stack 1 actions" }),
        );
        const side = count === 1 ? "Insert left" : "Insert right";
        const item = await body.findByRole("menuitem", { name: side });
        if (count === maximumStacks) {
          expect(item).toHaveAttribute("aria-disabled", "true");
          expect(item).toHaveAttribute("title", "Not enough space in this Section");
          await userEvent.keyboard("{Escape}");
          await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
          break;
        }
        await userEvent.click(item);
        await waitFor(() =>
          expect(section.querySelectorAll("[data-wall-stack-id]")).toHaveLength(count + 1),
        );
        const stacks = Array.from(section.querySelectorAll<HTMLElement>("[data-wall-stack-id]"));
        expect(stacks[0].dataset.wallStackId).not.toBe(originalId);
        expect(stacks[1].dataset.wallStackId).toBe(originalId);
        if (count === 1) {
          for (const stack of stacks)
            expect(stack.getBoundingClientRect().width).toBeCloseTo(availableWidth / 2, 1);
        }
        for (const stack of stacks.filter((stack) => stack !== original)) {
          expect(stack.querySelectorAll("[data-wall-row-id]")).toHaveLength(0);
          expect(
            within(stack).getByRole("button", { name: "Stack Stack actions" }),
          ).toBeInTheDocument();
        }
      }
      const stacks = Array.from(section.querySelectorAll<HTMLElement>("[data-wall-stack-id]"));
      expect(stacks).toHaveLength(maximumStacks);
      expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth + 1);
      if (maximumStacks > 2)
        expect(original.getBoundingClientRect().width).toBeCloseTo(originalMinimum, 1);
      for (const surface of section.querySelectorAll<HTMLElement>(".brick-hover-surface"))
        expect(surface.getBoundingClientRect().width).toBeGreaterThanOrEqual(159.9);
      const empty = stacks.find((stack) => stack !== original);
      if (empty) {
        await userEvent.click(within(empty).getByRole("button", { name: "Stack Stack actions" }));
        expect(await body.findByRole("menuitem", { name: "Insert left" })).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        expect(body.getByRole("menuitem", { name: "Insert right" })).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
      }
    }
  },
};

export const StackInsertionWithGaps: StoryObj<typeof meta> = {
  ...StackInsertion,
  args: { brickGap: 12, cardStyle: true },
};

/** A rejected central destination must not become an implicit new Row. */
export const FitRejection: StoryObj<typeof meta> = {
  args: { brickGap: 12 },
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    await within(canvasElement).findByRole(
      "button",
      { name: "sm preview, 360px" },
      { timeout: 10000 },
    );
    const source = canvasElement.querySelector<HTMLElement>(
      `[data-wall-placement-id="${makePlacementId("brk_story-2", "sm")}"]`,
    );
    const target = canvasElement.querySelector<HTMLElement>(
      `[data-wall-placement-id="${makePlacementId("brk_story-0", "sm")}"]`,
    );
    const handle = source?.querySelector<HTMLElement>("[data-wall-drag-handle]");
    const sourceRow = source?.closest<HTMLElement>("[data-wall-row-id]");
    const targetRow = target?.closest<HTMLElement>("[data-wall-row-id]");
    if (!source || !target || !handle || !sourceRow || !targetRow)
      throw new Error("Missing fit-rejection fixture");
    const originalRowId = sourceRow.dataset.wallRowId;
    const transfer = new DataTransfer();
    try {
      const handleBox = handle.getBoundingClientRect();
      fireEvent.dragStart(handle, {
        dataTransfer: transfer,
        clientX: handleBox.x + 8,
        clientY: handleBox.y + 8,
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const targetBox = target.getBoundingClientRect();
      const rowBox = targetRow.getBoundingClientRect();
      const clientX = targetBox.x + targetBox.width / 2;
      const clientY = rowBox.y + rowBox.height / 2;
      fireEvent.dragOver(target, { dataTransfer: transfer, clientX, clientY });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(canvasElement.querySelector("[data-wall-move-indicator]")).toBeNull();
      fireEvent.drop(target, { dataTransfer: transfer, clientX, clientY });
      fireEvent.dragEnd(handle, { dataTransfer: transfer });
      expect(source.closest<HTMLElement>("[data-wall-row-id]")?.dataset.wallRowId).toBe(
        originalRowId,
      );
      expect(canvasElement.querySelectorAll("[data-wall-row-id]")).toHaveLength(2);

      fireEvent.dragStart(handle, {
        dataTransfer: transfer,
        clientX: handleBox.x + 8,
        clientY: handleBox.y + 8,
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      fireEvent.dragOver(target, { dataTransfer: transfer, clientX, clientY: rowBox.top + 1 });
      await waitFor(() =>
        expect(canvasElement.querySelector("[data-wall-move-indicator]")).toHaveAttribute(
          "data-orientation",
          "horizontal",
        ),
      );
      fireEvent.drop(target, { dataTransfer: transfer, clientX, clientY: rowBox.top + 1 });
      fireEvent.dragEnd(handle, { dataTransfer: transfer });
      await waitFor(() => {
        const moved = canvasElement.querySelector(
          `[data-wall-placement-id="${makePlacementId("brk_story-2", "sm")}"]`,
        );
        expect(moved?.closest<HTMLElement>("[data-wall-row-id]")?.dataset.wallRowId).not.toBe(
          originalRowId,
        );
        expect(
          moved?.closest("[data-wall-row-id]")?.querySelectorAll("[data-wall-placement-id]"),
        ).toHaveLength(1);
      });
    } finally {
      fireEvent.dragEnd(document.body);
    }
  },
};
