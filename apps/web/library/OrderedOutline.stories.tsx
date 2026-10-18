import type { Meta, StoryObj } from "@storybook/react-vite";

import { OrderedOutline } from "./OrderedOutline";

const meta = {
  title: "Web/OrderedOutline",
  component: OrderedOutline,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Reusable `OrderedOutline` from `library/OrderedOutline.tsx`, including active and muted section links.",
      },
      source: {
        code: `import { OrderedOutline } from "@/library/OrderedOutline";

<OrderedOutline
  sections={[
    {
      label: "Getting started",
      tone: "active",
      children: [
        { label: "Dashboard", tone: "active" },
        { label: "Privacy", tone: "muted" },
      ],
    },
    { label: "Terms", tone: "muted" },
  ]}
/>`,
      },
    },
  },
  args: {
    sections: [
      {
        label: "Getting started",
        tone: "active",
        children: [
          { label: "Dashboard", tone: "active" },
          { label: "Privacy", tone: "muted" },
        ],
      },
      { label: "Terms", tone: "muted" },
    ],
  },
} satisfies Meta<typeof OrderedOutline>;

export default meta;

export const Navigation = {} satisfies StoryObj<typeof meta>;
