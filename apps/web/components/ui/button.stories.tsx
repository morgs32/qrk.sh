import type { Meta, StoryObj } from "@storybook/react-vite";

import { UnderlinedLink } from "../UnderlinedLink";

import { Button } from "./button";

const meta = {
  title: "Web/Button Links",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Reusable `Button` from `components/ui/button.tsx`. Use `asChild` with `UnderlinedLink` and override its text size and underline to retain the button styles.",
      },
    },
  },
  args: {
    children: "Dashboard",
    variant: "default",
    size: "default",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    children: { control: "text" },
    asChild: { table: { disable: true } },
  },
  render: (props) => {
    const { children, ...buttonProps } = props;
    return (
      <Button {...buttonProps} asChild>
        <UnderlinedLink
          className={
            buttonProps.variant === "link"
              ? "text-sm! no-underline! hover:underline!"
              : "text-sm! no-underline!"
          }
          href="/replace"
        >
          {children}
        </UnderlinedLink>
      </Button>
    );
  },
} satisfies Meta<typeof Button>;

export default meta;

export const AllVariants = {
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Button } from "@/components/ui/button";

<div className="flex flex-wrap items-center gap-4">
  <Button asChild>
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Default</UnderlinedLink>
  </Button>
  <Button asChild variant="destructive">
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Destructive</UnderlinedLink>
  </Button>
  <Button asChild variant="outline">
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Outline</UnderlinedLink>
  </Button>
  <Button asChild variant="secondary">
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Secondary</UnderlinedLink>
  </Button>
  <Button asChild variant="ghost">
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Ghost</UnderlinedLink>
  </Button>
  <Button asChild variant="link">
    <UnderlinedLink className="text-sm! no-underline! hover:underline!" href="/replace">Link</UnderlinedLink>
  </Button>
</div>`,
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button asChild>
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Default
        </UnderlinedLink>
      </Button>
      <Button asChild variant="destructive">
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Destructive
        </UnderlinedLink>
      </Button>
      <Button asChild variant="outline">
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Outline
        </UnderlinedLink>
      </Button>
      <Button asChild variant="secondary">
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Secondary
        </UnderlinedLink>
      </Button>
      <Button asChild variant="ghost">
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Ghost
        </UnderlinedLink>
      </Button>
      <Button asChild variant="link">
        <UnderlinedLink className="text-sm! no-underline! hover:underline!" href="/replace">
          Link
        </UnderlinedLink>
      </Button>
    </div>
  ),
} satisfies StoryObj<typeof meta>;

export const Sizes = {
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Button } from "@/components/ui/button";

<div className="flex flex-wrap items-center gap-4">
  <Button asChild size="sm">
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Small</UnderlinedLink>
  </Button>
  <Button asChild>
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Default</UnderlinedLink>
  </Button>
  <Button asChild size="lg">
    <UnderlinedLink className="text-sm! no-underline!" href="/replace">Large</UnderlinedLink>
  </Button>
  <Button asChild size="icon">
    <UnderlinedLink aria-label="Open Dashboard" className="text-sm! no-underline!" href="/replace">
      →
    </UnderlinedLink>
  </Button>
</div>`,
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button asChild size="sm">
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Small
        </UnderlinedLink>
      </Button>
      <Button asChild>
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Default
        </UnderlinedLink>
      </Button>
      <Button asChild size="lg">
        <UnderlinedLink className="text-sm! no-underline!" href="/replace">
          Large
        </UnderlinedLink>
      </Button>
      <Button asChild size="icon">
        <UnderlinedLink
          aria-label="Open Dashboard"
          className="text-sm! no-underline!"
          href="/replace"
        >
          →
        </UnderlinedLink>
      </Button>
    </div>
  ),
} satisfies StoryObj<typeof meta>;

export const Playground = {
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Button } from "@/components/ui/button";

<Button asChild variant="default" size="default">
  <UnderlinedLink className="text-sm! no-underline!" href="/replace">Dashboard</UnderlinedLink>
</Button>`,
      },
    },
  },
} satisfies StoryObj<typeof meta>;
