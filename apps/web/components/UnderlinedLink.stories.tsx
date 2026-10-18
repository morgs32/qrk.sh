import type { Meta, StoryObj } from "@storybook/react-vite";

import { UnderlinedLink } from "./UnderlinedLink";

const meta = {
  title: "Web/UnderlinedLink",
  component: UnderlinedLink,
  args: {
    href: "/privacy",
    children: "Privacy",
    size: "sm",
    variant: "default",
  },
  argTypes: {
    size: { control: "select", options: ["sm", "lg"] },
    variant: { control: "select", options: ["default", "accent"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Always-underlined navigation link with an optional orange accent. Small is 12px; large is 16px. Defaults to small and the default variant.",
      },
    },
  },
} satisfies Meta<typeof UnderlinedLink>;

export default meta;

export const Small = { args: { size: "sm" } } satisfies StoryObj<typeof meta>;

export const Large = { args: { size: "lg" } } satisfies StoryObj<typeof meta>;

export const Accent = {
  args: {
    href: "/replace",
    children: "Dashboard",
    size: "lg",
    variant: "accent",
  },
} satisfies StoryObj<typeof meta>;
