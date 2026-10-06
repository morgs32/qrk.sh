import { primitives } from "@zerospin/shapes";

import { defineComponent } from "../../../make/defineComponent";

export const locationComponent = defineComponent({
  type: "Location",
  props: {
    location: primitives.text({ nullable: true }),
  },
  description:
    'Profile location line. Bind location with { "$state": "/location" }. Do not invent empty literals. No implied parent.',
});
