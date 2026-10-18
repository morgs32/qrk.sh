import type { Meta, StoryObj } from "@storybook/react-vite";

import { UnderlinedLink } from "./UnderlinedLink";

const meta = {
  title: "Web/Underlined Link",
  component: UnderlinedLink,
  args: {
    href: "/privacy",
    children: "Privacy",
    size: "sm",
  },
  argTypes: {
    size: { control: "select", options: ["sm", "lg"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Always-underlined navigation link. Small is 12px; large is 16px. Defaults to small.",
      },
    },
  },
} satisfies Meta<typeof UnderlinedLink>;

export default meta;

export const Small = { args: { size: "sm" } } satisfies StoryObj<typeof meta>;

export const Large = { args: { size: "lg" } } satisfies StoryObj<typeof meta>;
