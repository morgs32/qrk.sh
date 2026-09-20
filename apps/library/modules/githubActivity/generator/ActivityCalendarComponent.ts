import { primitives } from "@zerospin/schema";
import { Schema } from "effect";

import { defineComponent } from "../../../make/defineComponent";

export const activityCalendarComponent = defineComponent({
  type: "ActivityCalendar",
  props: {
    contributions: primitives.json({
      schema: Schema.mutable(
        Schema.Array(
          Schema.Struct({
            date: Schema.String,
            count: Schema.Int,
            level: Schema.Literals([0, 1, 2, 3, 4]),
          }),
        ),
      ),
    }),
  },
  description:
    'GitHub contribution calendar. Bind contributions with { "$state": "/contributions" }. Do not invent empty arrays.',
});
