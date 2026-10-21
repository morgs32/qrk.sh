import type { Preview } from "@storybook/react-vite";
import "../modules/article/article-editor.css";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
