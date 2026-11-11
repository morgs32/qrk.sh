import "@fontsource-variable/geist";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ColorInput } from "./FormInputs/ColorInput";
import { Input } from "./FormInputs/Input";
import { StyleInspector } from "./StyleInspector";

const meta = {
  title: "Components/Style Inspector",
  component: StyleInspector,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, { args }) => (
      <div
        className={
          args.layout === "drawer"
            ? "flex min-h-dvh items-end bg-neutral-100"
            : "flex min-h-svh justify-end bg-white"
        }
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StyleInspector>;

export default meta;

export const Sidebar: StoryObj<typeof meta> = {
  args: { layout: "sidebar" },
  render: function RenderSidebar(args) {
    const [color, setColor] = useState("#b73737");
    const pickerColor = /^#[a-f\d]{6}$/i.test(color) ? color : "#b73737";

    return (
      <StyleInspector {...args}>
        <section
          className="mt-6 grid gap-4 border-t border-sidebar-border pt-4"
          aria-label="Form inputs"
        >
          <h2 className="text-xs font-semibold">Form inputs</h2>
          {[
            { label: "Text", type: "text", placeholder: "Title" },
            { label: "URL", type: "url", placeholder: "https://example.com" },
            { label: "Search", type: "search", placeholder: "Search" },
            { label: "File", type: "file" },
          ].map(({ label, type, placeholder }) => (
            <label key={type} className="grid gap-1.5 text-xs text-black">
              {label}
              <Input type={type} placeholder={placeholder} />
            </label>
          ))}
          <div className="grid gap-1.5">
            <span className="text-xs text-black">Color</span>
            <ColorInput
              value={color}
              pickerColor={pickerColor}
              onChange={setColor}
              onCommit={setColor}
            />
          </div>
        </section>
      </StyleInspector>
    );
  },
};
export const Drawer: StoryObj<typeof meta> = {
  args: { layout: "drawer" },
};
