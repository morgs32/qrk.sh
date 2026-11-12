import type { Meta, StoryObj } from "@storybook/react-vite";

import { OmniLinkForm } from "./OmniLinkForm";

const meta = {
  title: "Modules/OmniLink",
  component: OmniLinkForm,
} satisfies Meta<typeof OmniLinkForm>;

export default meta;

export const Lookup: StoryObj<typeof meta> = { name: "Form" };
