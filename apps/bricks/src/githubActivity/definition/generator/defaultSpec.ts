import type { Spec } from "@json-render/core";

export const defaultSpec: Spec = {
  root: "shell-1",
  elements: {
    "shell-1": {
      type: "BrickShell",
      props: {},
      children: ["calendar-1"],
    },
    "calendar-1": {
      type: "ActivityCalendar",
      props: {
        contributions: { $state: "/data/contributions" },
      },
    },
  },
};
