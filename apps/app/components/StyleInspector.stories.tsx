import "@fontsource-variable/geist";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { StyleInspector } from "./StyleInspector";

const meta = {
  title: "Components/Style Inspector",
  component: StyleInspector,
  decorators: [
    (Story, { args }) => (
      <div
        className={
          args.layout === "drawer"
            ? "flex min-h-dvh items-end bg-neutral-100"
            : "flex min-h-[374px] w-[550px] max-w-full justify-end bg-neutral-100"
        }
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StyleInspector>;

export default meta;

export const Default: StoryObj<typeof meta> = { args: { defaultCornersOpen: true } };
export const CornersClosed: StoryObj<typeof meta> = {};
export const Drawer: StoryObj<typeof meta> = {
  args: { layout: "drawer" },
  parameters: { layout: "fullscreen" },
};
