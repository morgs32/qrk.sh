import type { Meta, StoryObj } from "@storybook/react-vite";
import Link from "next/link";

import { Button } from "@qrk.sh/bricks/components/button";

const meta = {
  title: "Web/Button Links",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Render a Next.js Link with `role=\"link\"` and set `nativeButton={false}` on the Bricks Button.",
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
    render: { table: { disable: true } },
  },
  render: (props) => {
    const { children, ...buttonProps } = props;
    return (
      <Button {...buttonProps} nativeButton={false} render={<Link href="/replace" role="link" />
        }>{children}
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
import { Button } from "@qrk.sh/bricks/components/button";

<div className="flex flex-wrap items-center gap-4">
  <Button nativeButton={false} render={<Link href="/replace" role="link" />
    }>Default
  </Button>
  <Button nativeButton={false} variant="destructive" render={<Link href="/replace" role="link" />
    }>Destructive
  </Button>
  <Button nativeButton={false} variant="outline" render={<Link href="/replace" role="link" />
    }>Outline
  </Button>
  <Button nativeButton={false} variant="secondary" render={<Link href="/replace" role="link" />
    }>Secondary
  </Button>
  <Button nativeButton={false} variant="ghost" render={<Link href="/replace" role="link" />
    }>Ghost
  </Button>
  <Button nativeButton={false} variant="link" render={<Link href="/replace" role="link" />
    }>Link
  </Button>
</div>`,
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button nativeButton={false} render={<Link href="/replace" role="link" />
        }>Default
      </Button>
      <Button nativeButton={false} variant="destructive" render={<Link href="/replace" role="link" />
        }>Destructive
      </Button>
      <Button nativeButton={false} variant="outline" render={<Link href="/replace" role="link" />
        }>Outline
      </Button>
      <Button nativeButton={false} variant="secondary" render={<Link href="/replace" role="link" />
        }>Secondary
      </Button>
      <Button nativeButton={false} variant="ghost" render={<Link href="/replace" role="link" />
        }>Ghost
      </Button>
      <Button nativeButton={false} variant="link" render={<Link href="/replace" role="link" />
        }>Link
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
import { Button } from "@qrk.sh/bricks/components/button";

<div className="flex flex-wrap items-center gap-4">
  <Button nativeButton={false} size="sm" render={<Link href="/replace" role="link" />
    }>Small
  </Button>
  <Button nativeButton={false} render={<Link href="/replace" role="link" />
    }>Default
  </Button>
  <Button nativeButton={false} size="lg" render={<Link href="/replace" role="link" />
    }>Large
  </Button>
  <Button nativeButton={false} size="icon" render={<Link aria-label="Open Dashboard" href="/replace" role="link" />}>
      →
    </Button>
</div>`,
      },
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button nativeButton={false} size="sm" render={<Link href="/replace" role="link" />
        }>Small
      </Button>
      <Button nativeButton={false} render={<Link href="/replace" role="link" />
        }>Default
      </Button>
      <Button nativeButton={false} size="lg" render={<Link href="/replace" role="link" />
        }>Large
      </Button>
      <Button nativeButton={false} size="icon" render={<Link aria-label="Open Dashboard" href="/replace" role="link" />}>
          →
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
import { Button } from "@qrk.sh/bricks/components/button";

<Button nativeButton={false} variant="default" size="default" render={<Link href="/replace" role="link" />}>Dashboard</Button>`,
      },
    },
  },
} satisfies StoryObj<typeof meta>;
