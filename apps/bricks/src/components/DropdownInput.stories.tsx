import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { DropdownInput } from "./DropdownInput";
import { DropdownInputExample } from "./DropdownInputExample";
import exampleSource from "./DropdownInputExample.tsx?raw";

const meta = {
  title: "Components/Form Inputs/Dropdown Input",
  component: DropdownInput,
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
} satisfies Meta<typeof DropdownInput>;

export default meta;

export const Example = {
  render: () => <DropdownInputExample />,
  parameters: {
    docs: { source: { language: "tsx", code: exampleSource } },
  },
} satisfies StoryObj<Partial<Parameters<typeof DropdownInput>[0]>>;

export const PortalInLightMode = {
  ...Example,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvasElement.ownerDocument.body;
    const trigger = canvas.getByRole("combobox", { name: "Fit" });

    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const listbox = await within(body).findByRole("listbox");
    const popup = listbox.closest("[data-slot=select-content]");
    if (popup === null) throw new Error("Select content is missing");
    await expect(canvasElement).not.toContainElement(listbox);
    await expect(getComputedStyle(popup).backgroundColor).toBe(
      getComputedStyle(body).backgroundColor,
    );
    await expect(getComputedStyle(popup).color).toBe(getComputedStyle(body).color);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(trigger).toHaveTextContent("Contain");
    await expect(trigger).toHaveFocus();
  },
} satisfies StoryObj<Partial<Parameters<typeof DropdownInput>[0]>>;

export const PortalInDarkMode = {
  ...PortalInLightMode,
  beforeEach: ({ canvasElement }) => {
    const root = canvasElement.ownerDocument.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => root.classList.toggle("dark", wasDark);
  },
} satisfies StoryObj<Partial<Parameters<typeof DropdownInput>[0]>>;
