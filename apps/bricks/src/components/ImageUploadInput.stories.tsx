import type { Meta, StoryObj } from "@storybook/react-vite";

import { ImageUploadInput } from "./ImageUploadInput";
import { ImageUploadInputExample } from "./ImageUploadInputExample";
import exampleSource from "./ImageUploadInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Image Upload Input",
  component: ImageUploadInput,
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
} satisfies Meta<typeof ImageUploadInput>;

export default meta;

export const Example = {
  render: () => <ImageUploadInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof ImageUploadInput>[0]>>;
