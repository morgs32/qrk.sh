import type { Meta, StoryObj } from "@storybook/react-vite";

import { CSSGridBackgroundGenerator } from "./CSSGridBackgroundGenerator";

const meta = {
  title: "App/CSS Grid Background Generator",
  component: CSSGridBackgroundGenerator,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CSSGridBackgroundGenerator>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
