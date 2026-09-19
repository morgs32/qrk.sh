import { defineComponent } from "../../../make/defineComponent";

export const linkCardComponent = defineComponent({
  type: "LinkCard",
  props: {},
  slots: ["default"],
  description: "Rich-preview card layout shell. Holds LinkCopy and LinkHeroImage.",
});
