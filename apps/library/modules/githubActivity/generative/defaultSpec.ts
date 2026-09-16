import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "calendar-1",
  elements: {
    "calendar-1": {
      type: "ActivityCalendar",
      props: {
        contributions: { $state: "/contributions" },
      },
    },
  },
};
