import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ColorInput } from "./ColorInput";
import { Input } from "./Input";

const meta = {
  title: "Components/Form Inputs",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const Catalog: StoryObj<typeof meta> = {
  render: function RenderCatalog() {
    const [color, setColor] = useState("#b73737");
    const pickerColor = /^#[a-f\d]{6}$/i.test(color) ? color : "#b73737";

    return (
      <div className="flex min-h-svh justify-end bg-white">
        <section
          className="grid w-64 max-w-full content-start gap-4 border-l border-sidebar-border bg-white p-3"
          aria-label="Form inputs"
        >
          <h2 className="text-xs font-semibold">Form inputs</h2>
          {[
            { label: "Text", type: "text", placeholder: "Title" },
            { label: "URL", type: "url", placeholder: "https://example.com" },
            { label: "Search", type: "search", placeholder: "Search" },
            { label: "File", type: "file" },
          ].map(({ label, type, placeholder }) => (
            <label key={type} className="grid gap-1.5">
              <span className="form-input-label">{label}</span>
              <Input type={type} placeholder={placeholder} />
            </label>
          ))}
          <div className="grid gap-1.5">
            <span className="form-input-label">Color</span>
            <ColorInput
              value={color}
              pickerColor={pickerColor}
              onChange={setColor}
              onCommit={setColor}
            />
          </div>
        </section>
      </div>
    );
  },
};
