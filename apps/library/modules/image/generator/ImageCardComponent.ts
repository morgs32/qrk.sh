import { defineComponent } from "../../../make/defineComponent";

export const imageCardComponent = defineComponent({
  type: "ImageCard",
  props: {},
  slots: ["default"],
  description: "Full-height column for an editorial image brick (media band then MediaFooter).",
});
