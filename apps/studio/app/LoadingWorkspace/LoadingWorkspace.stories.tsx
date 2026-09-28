import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingWorkspace } from "./LoadingWorkspace";
import "./LoadingWorkspace.css";

const meta = {
  title: "App/Loading workspace",
  component: LoadingWorkspace,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LoadingWorkspace>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InitialHtml: Story = {};
export const RouterHydration: Story = {};
