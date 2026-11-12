import type { Preview } from "@storybook/react-vite";
import { Description, Stories, Title } from "@storybook/addon-docs/blocks";
import "../app/globals.css";

const preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      codePanel: true,
      canvas: { sourceState: "shown" },
      source: { language: "tsx" },
      page: () => (
        <>
          <Title />
          <Description />
          <Stories title="Examples" />
        </>
      ),
    },
  },
} satisfies Preview;

export default preview;
