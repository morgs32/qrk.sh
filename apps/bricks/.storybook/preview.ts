import type { Preview } from "@storybook/react-vite";
import { createElement } from "react";
import "./preview.css";

const preview: Preview = {
  decorators: [
    (Story) => createElement("div", { className: "qrk-bricks contents" }, createElement(Story)),
  ],
  parameters: {
    options: { storySort: { order: ["Modules", "Components"] } },
  },
};

export default preview;
