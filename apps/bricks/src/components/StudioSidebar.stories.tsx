import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pencil } from "lucide-react";

import { Input } from "./Input";
import { StudioSidebar } from "./StudioSidebar";

const meta = {
  title: "Components/Studio Sidebar",
  component: StudioSidebar,
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="flex min-h-svh justify-end bg-white">
      <StudioSidebar {...args} />
    </div>
  ),
} satisfies Meta<typeof StudioSidebar>;

export default meta;

export const Default = {
  args: {
    label: "Edit brick",
    sections: [
      {
        title: "Link",
        content: <Input variant="sm" aria-label="URL" type="url" defaultValue="https://example.com" />,
      },
      {
        title: "Display",
        content: <Input variant="sm" aria-label="Title" defaultValue="Example link" />,
      },
    ],
  },
} satisfies StoryObj<typeof meta>;

export const Embedded: StoryObj<typeof meta> = {
  args: { ...Default.args, embedded: true },
  render: (args) => (
    <div className="relative flex h-svh justify-end bg-white">
      <aside
        aria-label="Workspace sidebar"
        className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-sidebar-border bg-background max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-[79] max-lg:max-w-[75vw] max-lg:shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-3 py-2">
          <span className="flex h-7 items-center gap-1 rounded-md bg-secondary px-2 text-xs font-medium text-secondary-foreground">
            <Pencil aria-hidden className="size-3.5" />
            Edit brick
          </span>
        </header>
        <div className="@container/workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto max-lg:pb-16">
          <StudioSidebar {...args} />
        </div>
      </aside>
    </div>
  ),
};
