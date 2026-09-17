"use client";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { ActivityCalendarView } from "../ActivityCalendar";
import { githubActivityJsonRenderCatalog } from "./GitHubActivityJsonRenderCatalog";

export const { registry } = defineRegistry(githubActivityJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    ActivityCalendar: ({ props }) => (
      <ActivityCalendarView
        contributions={Array.isArray(props.contributions) ? props.contributions : []}
      />
    ),
  },
});
