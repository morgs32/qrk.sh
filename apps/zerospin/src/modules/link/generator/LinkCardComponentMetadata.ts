import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const linkCardComponentMetadata = defineComponentMetadata({
  type: "LinkCard",
  propsShape: {},
  slots: ["default"],
  description: "Rich-preview card layout shell. Holds LinkCopy and LinkHeroImage.",
});
