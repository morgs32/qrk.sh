import type { Meta, StoryObj } from "@storybook/react-vite";

import { ButtonGroupInput } from "./ButtonGroupInput";
import { ButtonGroupInputExample } from "./ButtonGroupInputExample";
import exampleSource from "./ButtonGroupInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Button Group Input",
  component: ButtonGroupInput,
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
} satisfies Meta<typeof ButtonGroupInput>;

export default meta;

export const Example = {
  render: () => <ButtonGroupInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof ButtonGroupInput>[0]>>;
