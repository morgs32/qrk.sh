import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, fn, userEvent, waitFor, within } from "storybook/test";

import { WallPlacement } from "./WallPlacement";

const editBrick = fn();
const deleteBrick = fn();
const followLink = fn();
const pressButton = fn();
const placement = {
  id: "story-placement",
  brickId: "story-brick",
  defaultWidth: 320,
  minWidth: 160,
  content: (
    <div className="brick-surface space-y-3 border bg-white p-6">
      <p>Select this brick</p>
      <a href="#fixture-link" onClick={followLink}>
        Fixture link
      </a>
      <button type="button" onClick={pressButton}>
        Fixture button
      </button>
      <label className="block">
        Fixture input
        <input className="block border" />
      </label>
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Editable content"
      >
        Editable text
      </div>
      <p onClick={(event) => event.preventDefault()}>Prevented click</p>
    </div>
  ),
};

const meta = {
  title: "App/Studio/Wall Placement",
  component: WallPlacement,
  args: {
    placement,
    scope: "click-selection",
    brickGap: 0,
    selected: false,
    onEditBrick: editBrick,
    onRequestDelete: deleteBrick,
  },
  beforeEach: () => {
    editBrick.mockClear();
    deleteBrick.mockClear();
    followLink.mockClear();
    pressButton.mockClear();
  },
  render: function Render(props) {
    const { placement, scope, brickGap, selected, onEditBrick, onRequestDelete } = props;
    const [isSelected, setSelected] = useState(selected);
    return (
      <div className="qrk-bricks wall-story flex w-96 p-4">
        <WallPlacement
          placement={placement}
          scope={scope}
          brickGap={brickGap}
          selected={isSelected}
          onEditBrick={(brickId) => {
            onEditBrick?.(brickId);
            setSelected(true);
          }}
          onRequestDelete={onRequestDelete}
        />
      </div>
    );
  },
} satisfies Meta<typeof WallPlacement>;

export default meta;

export const ClickSelection: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const body = within(document.body);
    const text = canvas.getByText("Select this brick");

    await userEvent.click(canvas.getByRole("link", { name: "Fixture link" }));
    await userEvent.click(canvas.getByRole("button", { name: "Fixture button" }));
    await userEvent.type(canvas.getByLabelText("Fixture input"), "typed");
    await userEvent.click(canvas.getByRole("textbox", { name: "Editable content" }));
    await userEvent.click(canvas.getByText("Prevented click"));
    fireEvent.click(text, { ctrlKey: true });
    expect(followLink).toHaveBeenCalledOnce();
    expect(pressButton).toHaveBeenCalledOnce();
    expect(canvas.getByLabelText("Fixture input")).toHaveValue("typed");
    expect(editBrick).not.toHaveBeenCalled();

    // Keep a highlighted range through mouseup's click, as a text drag does.
    const selection = document.getSelection();
    if (selection === null) throw new Error("Missing text selection");
    const range = document.createRange();
    range.selectNodeContents(text);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      fireEvent.click(text);
      expect(editBrick).not.toHaveBeenCalled();
    } finally {
      selection.removeAllRanges();
    }

    const trigger = canvas.getByRole("button", { name: "Brick story-brick actions" });
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole("menuitem", { name: "Delete Brick" }));
    expect(deleteBrick).toHaveBeenCalledOnce();
    expect(editBrick).not.toHaveBeenCalled();

    // The existing menu remains the keyboard path into the edit form.
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => expect(body.getByRole("menuitem", { name: "Edit" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    expect(editBrick).toHaveBeenCalledExactlyOnceWith("story-brick");

    await userEvent.click(text);
    expect(editBrick).toHaveBeenCalledTimes(2);
    expect(canvasElement.querySelector("[data-wall-placement-id]")).toHaveClass("is-selected");
  },
};
