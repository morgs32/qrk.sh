import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Input } from "@/components/FormInputs/Input";
import { Button } from "@/components/ui/button";

import { Drawer } from "./Drawer";

const meta = {
  title: "Components/Drawer",
  component: Drawer,
  parameters: { layout: "fullscreen" },
  args: {
    side: "bottom",
    animated: true,
    "aria-label": "Page settings",
    children: (
      <label className="grid max-w-sm gap-1.5">
        <span className="form-input-label">Page title</span>
        <Input type="text" defaultValue="Home" />
      </label>
    ),
  },
  argTypes: {
    side: { control: "select", options: ["bottom", "left", "right"] },
  },
} satisfies Meta<typeof Drawer>;

export default meta;

export const Overlay: StoryObj<typeof meta> = {
  parameters: { controls: { include: ["side", "animated"] } },
  render: function RenderOverlay(args) {
    const { children, ...drawerArgs } = args;
    const [open, setOpen] = useState(false);

    return (
      <div className="flex min-h-dvh items-start justify-center bg-muted p-8">
        <Button type="button" aria-expanded={open} onClick={() => setOpen(true)}>
          Open drawer
        </Button>
        <Drawer {...drawerArgs} open={open}>
          <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">Page settings</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </header>
          <div className="min-h-0 overflow-y-auto p-4">{children}</div>
        </Drawer>
      </div>
    );
  },
};
