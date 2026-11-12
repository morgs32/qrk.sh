import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "./button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "Components/Tabs",
  component: TabsList,
  tags: ["autodocs"],
  args: { variant: "default", size: "default", "aria-label": "Example sections" },
  render: (args) => (
    <Tabs defaultValue="overview" className="w-80 max-w-full">
      <TabsList {...args}>
        <TabsTrigger value="overview" render={<Button type="button" variant="ghost" />}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="details" render={<Button type="button" variant="ghost" />}>
          Details
        </TabsTrigger>
        <TabsTrigger value="settings" render={<Button type="button" variant="ghost" />}>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview content</TabsContent>
      <TabsContent value="details">Details content</TabsContent>
      <TabsContent value="settings">Settings content</TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof TabsList>;

export default meta;

export const Rounded = {} satisfies StoryObj<typeof meta>;

export const RoundedSmall = {
  args: { size: "sm" },
} satisfies StoryObj<typeof meta>;

export const Line = {
  args: { variant: "line" },
} satisfies StoryObj<typeof meta>;

export const LineSmall = {
  args: { variant: "line", size: "sm" },
} satisfies StoryObj<typeof meta>;

export const KeyboardNavigation = {
  args: { variant: "line", size: "sm" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole("tab", { name: "Overview" });
    const details = canvas.getByRole("tab", { name: "Details" });
    overview.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(details).toHaveFocus();
    await expect(overview).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    await expect(details).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("Details content");
  },
} satisfies StoryObj<typeof meta>;
