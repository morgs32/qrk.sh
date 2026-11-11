import type { Meta, StoryObj } from "@storybook/react-vite";

import { TextInput } from "./TextInput";
import { TextInputExample } from "./TextInputExample";
import exampleSource from "./TextInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Text Input",
  component: TextInput,
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
} satisfies Meta<typeof TextInput>;

export default meta;

export const Example = {
  render: () => <TextInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof TextInput>[0]>>;
