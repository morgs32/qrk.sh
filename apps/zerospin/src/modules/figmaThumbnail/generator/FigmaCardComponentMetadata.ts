import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const figmaCardComponentMetadata = defineComponentMetadata({
  type: "FigmaCard",
  propsShape: {},
  slots: ["default"],
  description: "Full-height column for a Figma thumbnail brick (media band then footer).",
});
