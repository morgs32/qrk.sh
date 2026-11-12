import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import { ButtonExamples } from "./ButtonExamples";
import exampleSource from "./ButtonExamples.tsx?raw";

const meta = {
  title: "Components/Buttons",
  component: Button,
  tags: ["autodocs", "!dev"],
  decorators: [
    (Story) => (
      <div className="max-w-full p-3">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "centered",
    docs: { codePanel: true, canvas: { sourceState: "shown" } },
  },
} satisfies Meta<typeof Button>;

export default meta;

export const Examples = {
  render: () => <ButtonExamples />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<typeof meta>;
