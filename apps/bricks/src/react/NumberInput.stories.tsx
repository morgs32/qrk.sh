import type { Meta, StoryObj } from "@storybook/react-vite";

import { NumberInput } from "./NumberInput";
import { NumberInputExample } from "./NumberInputExample";
import exampleSource from "./NumberInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Number Input",
  component: NumberInput,
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
} satisfies Meta<typeof NumberInput>;

export default meta;

export const Example = {
  render: () => <NumberInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof NumberInput>[0]>>;
