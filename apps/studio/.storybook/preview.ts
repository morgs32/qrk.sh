import type { Preview } from "@storybook/react-vite";
import "@qrk.sh/library/article-editor.css";
import "../app/globals.css";
import "../app/tiptap/styles/_variables.scss";
import "../app/tiptap/styles/_keyframe-animations.scss";

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
