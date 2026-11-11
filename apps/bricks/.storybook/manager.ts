import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

addons.setConfig({
  layout: { showPanel: false },
  theme: create({ base: "light", appBg: "#ffffff" }),
});
