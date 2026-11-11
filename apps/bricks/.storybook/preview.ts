import type { Preview } from "@storybook/react-vite";
import "./preview.css";

const preview: Preview = {
  parameters: {
    options: { storySort: { order: ["Modules", "Components"] } },
  },
};

export default preview;
