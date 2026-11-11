import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import wallEditorMeta from "../../WallEditor.stories";

const meta = {
  ...wallEditorMeta,
  title: "Studio/WallEditor.tsx/Scripted",
  id: "app-studio-wall-editor",
};

export default meta;

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
    const stackBorder = getComputedStyle(stackActions, "::before");
    expect(stackBorder.top).toBe("-1px");
    expect(stackBorder.left).toBe("-1px");
    expect(stackBorder.borderTopWidth).toBe("1px");
    expect(stackBorder.borderLeftWidth).toBe("1px");
    expect(stackBorder.borderTopColor).toBe(getComputedStyle(stackActions).backgroundColor);
    expect(stackBorder.pointerEvents).toBe("none");
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
      expect(
        within(article).queryByRole("button", { name: "Brick brk_story-4 actions" }),
      ).toBeNull();
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
