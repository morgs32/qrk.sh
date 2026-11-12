import type { Meta, StoryObj } from "@storybook/react-vite";

import { PositionInput } from "./PositionInput";
import { PositionInputExample } from "./PositionInputExample";
import exampleSource from "./PositionInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Position Input",
  component: PositionInput,
  tags: ["autodocs", "!dev"],
  decorators: [
    (Story) => (
      <div className="w-[260px] max-w-full p-3">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
    docs: { codePanel: true, canvas: { sourceState: "shown" } },
  },
} satisfies Meta<typeof PositionInput>;

export default meta;

export const Example = {
  render: () => <PositionInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof PositionInput>[0]>>;
