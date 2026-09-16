"use client";

import { defineRegistry } from "@json-render/react";
import { ActivityCalendar as ReactActivityCalendar } from "react-activity-calendar";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { githubActivityJsonRenderCatalog } from "./GitHubActivityJsonRenderCatalog";

function ActivityCalendarLeaf(props: {
  contributions: Array<{
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }>;
}) {
  return (
    <div
      data-github-activity
      className="flex h-full w-full items-center overflow-x-auto px-3 py-2 [&_[class$=legend-colors]]:ml-0!"
      style={{
        maskImage: "linear-gradient(to right, black calc(100% - 20px), transparent)",
      }}
    >
      <ReactActivityCalendar
        data={props.contributions}
        blockMargin={2}
        blockRadius={2}
        blockSize={9}
        colorScheme="light"
        fontSize={10}
        showTotalCount={false}
        showMonthLabels={true}
        showColorLegend={true}
        showWeekdayLabels={["mon", "wed", "fri"]}
      />
    </div>
  );
}

export const { registry } = defineRegistry(githubActivityJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    ActivityCalendar: ({ props }) => (
      <ActivityCalendarLeaf
        contributions={Array.isArray(props.contributions) ? props.contributions : []}
      />
    ),
  },
});
