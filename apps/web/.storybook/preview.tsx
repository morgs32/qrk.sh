import type { Preview } from "@storybook/react-vite";
import { Description, Stories, Title } from "@storybook/addon-docs/blocks";
import "@fontsource/silkscreen/400.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "../app/globals.css";
import "./preview.css";

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
