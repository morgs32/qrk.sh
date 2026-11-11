import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";

import { WallPlacement } from "./WallPlacement";

const editBrick = fn();
const followLink = fn();
const pressButton = fn();
const placement = {
  id: "story-placement",
  brickId: "story-brick",
  width: 320,
  minWidth: 160,
  content: (
    <div className="brick-surface space-y-3 border bg-white p-6">
      <p>Select this brick</p>
      <a href="#fixture-link" target="_self" onClick={followLink}>
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
    brickGap: 0,
    selected: false,
    onEditBrick: editBrick,
  },
  beforeEach: () => {
    editBrick.mockClear();
    followLink.mockClear();
    pressButton.mockClear();
  },
  render: function Render(props) {
    const { placement, brickGap, selected, onEditBrick } = props;
    const [isSelected, setSelected] = useState(selected);
    return (
      <div className="qrk-bricks wall-story flex w-96 p-4">
        <WallPlacement
          placement={placement}
          brickGap={brickGap}
          selected={isSelected}
          onEditBrick={(brickId) => {
            onEditBrick?.(brickId);
            setSelected(true);
          }}
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

    const edit = canvas.getByRole("group", { name: "Edit Brick story-brick" });
    expect(canvas.queryByRole("button", { name: "Edit Brick story-brick" })).toBeNull();
    expect(canvas.queryByRole("button", { name: "Brick story-brick actions" })).toBeNull();
    edit.focus();
    await userEvent.keyboard("{Enter}");
    expect(editBrick).toHaveBeenCalledOnce();
    expect(editBrick).toHaveBeenCalledWith("story-brick");

    await userEvent.click(text);
    expect(editBrick).toHaveBeenCalledTimes(2);
    expect(canvasElement.querySelector("[data-wall-placement-id]")).toHaveClass("is-selected");
  },
};
