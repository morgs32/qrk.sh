"use client";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { ActivityCalendarView } from "../ActivityCalendar";
import { githubActivityV1 } from "../githubActivityV1";

export const { registry } = defineRegistry(githubActivityV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    ActivityCalendar: ({ props }: { props: Record<string, unknown> }) => (
      <ActivityCalendarView
        contributions={Array.isArray(props.contributions) ? props.contributions : []}
      />
    ),
  },
});
