import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const imageCardComponentMetadata = defineComponentMetadata({
  type: "ImageCard",
  propsShape: {},
  slots: ["default"],
  description: "Full-height column for an editorial image brick (media band then MediaFooter).",
});
