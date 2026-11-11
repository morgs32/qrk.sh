import type { Meta, StoryObj } from "@storybook/react-vite";

import { ColorInput } from "./ColorInput";
import { ColorInputExample } from "./ColorInputExample";
import exampleSource from "./ColorInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Color Input",
  component: ColorInput,
  tags: ["autodocs", "!dev"],
  decorators: [
    (Story) => (
      <div className="qrk-bricks w-[260px] max-w-full p-3">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
    docs: { codePanel: true, canvas: { sourceState: "shown" } },
  },
} satisfies Meta<typeof ColorInput>;

export default meta;

export const Example = {
  render: () => <ColorInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof ColorInput>[0]>>;
