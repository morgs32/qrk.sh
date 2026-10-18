import type { Meta, StoryObj } from "@storybook/react-vite";

import { UnderlinedLink } from "../../components/UnderlinedLink";

const meta = {
  title: "Web/Links",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

export const Dashboard = {
  parameters: {
    docs: {
      description: {
        story:
          "The home page's orange Dashboard link uses `UnderlinedLink` with Silkscreen and an underline on hover.",
      },
      source: {
        language: "tsx",
        code: `import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Silkscreen } from "next/font/google";

const silkscreen = Silkscreen({ subsets: ["latin"], weight: "400" });

<UnderlinedLink
  className={\`\${silkscreen.className} font-bold text-[#E86F3A] no-underline! hover:underline! underline-offset-auto!\`}
  href="/replace"
  size="lg"
>
  DASHBOARD
</UnderlinedLink>`,
      },
    },
  },
  render: () => (
    <UnderlinedLink
      className="font-[family-name:var(--font-silkscreen)] font-normal text-[#E86F3A] no-underline! hover:underline! underline-offset-auto!"
      href="/replace"
      size="lg"
    >
      DASHBOARD
    </UnderlinedLink>
  ),
} satisfies StoryObj<typeof meta>;
