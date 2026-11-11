import type { Preview } from "@storybook/react-vite";
import "@qrk.sh/bricks/article/editor.css";
import "./preview.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    options: {
      storySort: {
        order: [
          "Studio",
          ["WallEditor.tsx", "Wall Placement", "Site Tree"],
          "Modules",
          "Components",
          "Experiments",
        ],
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
