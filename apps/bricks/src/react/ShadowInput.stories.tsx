import type { Meta, StoryObj } from "@storybook/react-vite";

import { ShadowInput } from "./ShadowInput";
import { ShadowInputExample } from "./ShadowInputExample";
import exampleSource from "./ShadowInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Shadow Input",
  component: ShadowInput,
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
} satisfies Meta<typeof ShadowInput>;

export default meta;

export const Example = {
  render: () => <ShadowInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof ShadowInput>[0]>>;
