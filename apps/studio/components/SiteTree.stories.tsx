import type { Meta, StoryObj } from "@storybook/react-vite";

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
  component: SiteTree,
  args: {
    nodes: ledgerNodes,
    highlightIndex: 1,
  },
} satisfies Meta<typeof SiteTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
