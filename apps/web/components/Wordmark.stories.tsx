import type { Meta, StoryObj } from "@storybook/react-vite";

import { Wordmark } from "./Wordmark";

const meta = {
  title: "Web/Wordmark",
  component: Wordmark,
  parameters: {
    docs: {
      description: {
        component:
          "QRK.SH Silkscreen wordmark, linking home. Used on the home, Privacy, and Terms pages.",
      },
      source: {
        language: "tsx",
        code: `import { Wordmark } from "@/components/Wordmark";

<Wordmark />`,
      },
    },
  },
} satisfies Meta<typeof Wordmark>;

export default meta;

export const Default = {} satisfies StoryObj<typeof meta>;
