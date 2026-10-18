import type { Meta, StoryObj } from "@storybook/react-vite";
import Link from "next/link";

import { Button } from "./button";

const meta = {
  title: "Web/Button Links",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Reusable `Button` from `components/ui/button.tsx`. Use `asChild` with Next.js `Link` for navigation with button styles.",
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
        <Link href="/replace">{children}</Link>
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
        code: `import Link from "next/link";
import { Button } from "@/components/ui/button";

<div className="flex flex-wrap items-center gap-4">
  <Button asChild>
    <Link href="/replace">Default</Link>
  </Button>
  <Button asChild variant="destructive">
    <Link href="/replace">Destructive</Link>
  </Button>
  <Button asChild variant="outline">
    <Link href="/replace">Outline</Link>
  </Button>
  <Button asChild variant="secondary">
    <Link href="/replace">Secondary</Link>
  </Button>
  <Button asChild variant="ghost">
    <Link href="/replace">Ghost</Link>
  </Button>
  <Button asChild variant="link">
    <Link href="/replace">Link</Link>
  </Button>
</div>`,
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button asChild>
        <Link href="/replace">Default</Link>
      </Button>
      <Button asChild variant="destructive">
        <Link href="/replace">Destructive</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/replace">Outline</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/replace">Secondary</Link>
      </Button>
      <Button asChild variant="ghost">
        <Link href="/replace">Ghost</Link>
      </Button>
      <Button asChild variant="link">
        <Link href="/replace">Link</Link>
      </Button>
    </div>
  ),
} satisfies StoryObj<typeof meta>;

export const Sizes = {
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `import Link from "next/link";
import { Button } from "@/components/ui/button";

<div className="flex flex-wrap items-center gap-4">
  <Button asChild size="sm">
    <Link href="/replace">Small</Link>
  </Button>
  <Button asChild>
    <Link href="/replace">Default</Link>
  </Button>
  <Button asChild size="lg">
    <Link href="/replace">Large</Link>
  </Button>
  <Button asChild size="icon">
    <Link aria-label="Open Dashboard" href="/replace">
      →
    </Link>
  </Button>
</div>`,
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button asChild size="sm">
        <Link href="/replace">Small</Link>
      </Button>
      <Button asChild>
        <Link href="/replace">Default</Link>
      </Button>
      <Button asChild size="lg">
        <Link href="/replace">Large</Link>
      </Button>
      <Button asChild size="icon">
        <Link aria-label="Open Dashboard" href="/replace">
          →
        </Link>
      </Button>
    </div>
  ),
} satisfies StoryObj<typeof meta>;

export const Playground = {
  parameters: {
    docs: {
      source: {
        language: "tsx",
        code: `import Link from "next/link";
import { Button } from "@/components/ui/button";

<Button asChild variant="default" size="default">
  <Link href="/replace">Dashboard</Link>
</Button>`,
      },
    },
  },
} satisfies StoryObj<typeof meta>;
