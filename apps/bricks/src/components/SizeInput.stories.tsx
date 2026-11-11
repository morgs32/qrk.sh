import type { Meta, StoryObj } from "@storybook/react-vite";

import { SizeInput } from "./SizeInput";
import { SizeInputExample } from "./SizeInputExample";
import exampleSource from "./SizeInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Size Input",
  component: SizeInput,
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
} satisfies Meta<typeof SizeInput>;

export default meta;

export const Example = {
  render: () => <SizeInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof SizeInput>[0]>>;
