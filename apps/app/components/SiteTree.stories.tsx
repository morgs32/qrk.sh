import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { SiteTree, type ISiteTreeNode } from "./SiteTree";

const ledgerNodes: readonly ISiteTreeNode[] = [
  {
    label: "assets",
    kind: "asset",
    children: [
      { label: "cash" },
      {
        label: "receivables",
        children: [
          {
            label: "user",
            children: [{ label: "order" }],
          },
        ],
      },
    ],
  },
  {
    label: "liabilities",
    kind: "liability",
    children: [
      {
        label: "payables",
        children: [
          {
            label: "restaurant",
            children: [{ label: "order" }, { label: "payout" }],
          },
          {
            label: "driver",
            children: [{ label: "order" }],
          },
        ],
      },
    ],
  },
  {
    label: "income",
    kind: "income",
    children: [{ label: "platform_fee" }],
  },
];

const meta = {
  title: "Studio/Site Tree",
  id: "sitetree",
  component: SiteTree,
  args: {
    nodes: ledgerNodes,
    highlightIndex: 1,
  },
} satisfies Meta<typeof SiteTree>;

export default meta;

type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};

export const PublishSelection: IStory = {
  render: function RenderPublishSelection() {
    const [selected, setSelected] = useState(false);
    return (
      <SiteTree
        nodes={[
          {
            label: "Home",
            checkbox: { checked: true, disabled: true },
            children: [
              {
                label: "About",
                checkbox: { checked: selected, onCheckedChange: setSelected },
              },
            ],
          },
        ]}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const root = canvas.getByRole("checkbox", { name: "Home" });
    const about = canvas.getByRole("checkbox", { name: "About" });

    await expect(root).toBeChecked();
    await expect(root).toHaveAttribute("aria-disabled", "true");
    await expect(about).not.toBeChecked();
    await userEvent.click(canvas.getByText("About"));
    await expect(about).toBeChecked();
  },
};
