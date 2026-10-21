import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModulePlayground } from "../lib/ModulePlayground";

const meta = {
  title: "Modules/Figma Thumbnail",
  component: ModulePlayground,
  parameters: { layout: "fullscreen" },
  args: { moduleId: "figma-thumbnail", fixture: "configured" },
  argTypes: {
    moduleId: { control: false },
    fixture: { control: false },
  },
  render: (args) => <ModulePlayground key={`${args.moduleId}:${args.fixture}`} {...args} />,
} satisfies Meta<typeof ModulePlayground>;

export default meta;

export const Playground: StoryObj<typeof meta> = {};
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
