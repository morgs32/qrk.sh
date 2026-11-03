import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../make/defineComponentMetadata";

export const locationComponentMetadata = defineComponentMetadata({
  type: "Location",
  propsShape: {
    location: primitives.text({ nullable: true }),
  },
  description:
    'Profile location line. Bind location with { "$state": "/location" }. Do not invent empty literals. No implied parent.',
});
