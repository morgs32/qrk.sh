"use client";

import { ActivityCalendar } from "react-activity-calendar";

import { BrickFrame } from "../../BrickFrame";

export function GitHubActivityCalendar(props: {
  breakpoint: "xs" | "sm" | "lg" | "xl";
  data: {
    contributions: Array<{
      date: string;
      count: number;
      level: 0 | 1 | 2 | 3 | 4;
    }>;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div
        data-github-activity
        data-brick-breakpoint={props.breakpoint}
        className="flex h-full w-full items-center overflow-x-auto px-3 py-2 [&_[class$=legend-colors]]:ml-0!"
        style={{
          maskImage: "linear-gradient(to right, black calc(100% - 20px), transparent)",
        }}
      >
        <ActivityCalendar
          data={props.data.contributions}
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
    </BrickFrame>
  );
}
