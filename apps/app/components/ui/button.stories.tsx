import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@qrk.sh/bricks/components/button";

const meta = {
  title: "Components/Button",
  tags: ["!dev"],
  id: "ui-button",
  component: Button,
  args: {
    children: "Button",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
