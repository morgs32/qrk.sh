import type { Meta, StoryObj } from "@storybook/react-vite";

import { RadiusInput } from "./RadiusInput";
import { RadiusInputExample } from "./RadiusInputExample";
import exampleSource from "./RadiusInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Radius Input",
  component: RadiusInput,
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
} satisfies Meta<typeof RadiusInput>;

export default meta;

export const Example = {
  render: () => <RadiusInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof RadiusInput>[0]>>;
