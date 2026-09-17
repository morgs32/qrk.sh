"use client";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { ActivityCalendarView } from "../ActivityCalendar";
import { githubActivity } from "../githubActivity";

export const { registry } = defineRegistry(githubActivity.catalog, {
  components: {
    ...layoutRegistryComponents,
    ActivityCalendar: ({ props }: { props: Record<string, unknown> }) => (
      <ActivityCalendarView
        contributions={Array.isArray(props.contributions) ? props.contributions : []}
      />
    ),
  },
});
