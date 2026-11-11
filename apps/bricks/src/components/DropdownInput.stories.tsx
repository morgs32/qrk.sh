import type { Meta, StoryObj } from "@storybook/react-vite";

import { DropdownInput } from "./DropdownInput";
import { DropdownInputExample } from "./DropdownInputExample";
import exampleSource from "./DropdownInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Dropdown Input",
  component: DropdownInput,
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
} satisfies Meta<typeof DropdownInput>;

export default meta;

export const Example = {
  render: () => <DropdownInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof DropdownInput>[0]>>;
