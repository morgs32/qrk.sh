import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModulePlayground } from "../lib/ModulePlayground";

const meta = {
  title: "Modules/Swatch and Icon",
  component: ModulePlayground,
  parameters: { layout: "fullscreen" },
  args: { moduleId: "swatch-and-icon", fixture: "configured" },
  argTypes: {
    moduleId: { control: false },
    fixture: { control: false },
  },
  render: (args) => <ModulePlayground key={`${args.moduleId}:${args.fixture}`} {...args} />,
} satisfies Meta<typeof ModulePlayground>;

export default meta;

export const Playground: StoryObj<typeof meta> = {};
