import { defineComponent } from "../../../make/defineComponent";

export const figmaCardComponent = defineComponent({
  type: "FigmaCard",
  props: {},
  slots: ["default"],
  description: "Full-height column for a Figma thumbnail brick (media band then footer).",
});
