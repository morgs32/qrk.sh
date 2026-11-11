import type { Meta, StoryObj } from "@storybook/react-vite";

import { BorderInput } from "./BorderInput";
import { BorderInputExample } from "./BorderInputExample";
import exampleSource from "./BorderInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Border Input",
  component: BorderInput,
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
} satisfies Meta<typeof BorderInput>;

export default meta;

export const Example = {
  render: () => <BorderInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof BorderInput>[0]>>;
