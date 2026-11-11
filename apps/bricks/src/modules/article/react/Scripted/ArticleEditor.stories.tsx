import type { StoryObj } from "@storybook/react-vite";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import articleEditorMeta from "../ArticleEditor.stories";

const meta = {
  ...articleEditorMeta,
  title: "Modules/Article/Scripted",
  id: "modules-article",
};

export default meta;

export const BodyFirstAutosave: StoryObj<typeof meta> = {
  args: { state: null },
  play: async ({ args, canvasElement }) => {
    const body = await within(canvasElement).findByLabelText("Article content");
    await userEvent.type(body, "Body first");
    await waitFor(
      () =>
        expect(args.onSave).toHaveBeenCalledWith({
          title: "",
          subtitle: "",
          content: expect.stringMatching(/^Body first\s*$/),
        }),
      { timeout: 3000 },
    );
    expect(args.onSave).toHaveBeenCalledOnce();
    expect(body).toHaveFocus();
  },
};

export const RetryFailedAutosave: StoryObj<typeof meta> = {
  args: { state: null },
  play: async ({ args, canvasElement }) => {
    const save = mocked(args.onSave);
    save.mockReturnValueOnce({ _tag: "Failure", failure: { message: "Save refused." } });
    const canvas = within(canvasElement);
    const title = canvas.getByRole("textbox", { name: "Article title" });
    await userEvent.type(title, "First edit");
    expect(await canvas.findByRole("alert", undefined, { timeout: 3000 })).toHaveTextContent(
      "Save refused.",
    );
    expect(title).toHaveValue("First edit");

    await userEvent.type(title, " with newer text");
    const flush = mocked(args.registerFlush).mock.lastCall?.[0];
    if (flush === undefined) throw new Error("Expected a registered flush");
    const resume = fn();
    expect(flush(resume)).toBe(false);
    expect(save).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    expect(save).toHaveBeenLastCalledWith({
      title: "First edit with newer text",
      subtitle: "",
      content: null,
    });
    expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    expect(resume).toHaveBeenCalledOnce();
  },
};

export const DiscardFailedAutosave: StoryObj<typeof meta> = {
  args: { state: { title: "Saved title", subtitle: "", content: "Saved body" } },
  play: async ({ args, canvasElement }) => {
    const save = mocked(args.onSave);
    save.mockReturnValueOnce({ _tag: "Failure", failure: { message: "Save refused." } });
    const canvas = within(canvasElement);
    const title = canvas.getByRole("textbox", { name: "Article title" });
    const body = await canvas.findByLabelText("Article content");
    await userEvent.type(title, " changed");
    await userEvent.type(body, " changed");
    expect(await canvas.findByRole("alert", undefined, { timeout: 3000 })).toHaveTextContent(
      "Save refused.",
    );
    expect(body).toHaveTextContent("changed");

    const flush = mocked(args.registerFlush).mock.lastCall?.[0];
    if (flush === undefined) throw new Error("Expected a registered flush");
    const resume = fn();
    expect(flush(resume)).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "Discard changes" }));

    expect(title).toHaveValue("Saved title");
    expect(await canvas.findByLabelText("Article content")).toHaveTextContent(/^Saved body$/);
    expect(body).not.toBeInTheDocument();
    expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    expect(flush()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
  },
};
