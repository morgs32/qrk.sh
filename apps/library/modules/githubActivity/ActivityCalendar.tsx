"use client";

import { ActivityCalendar as ReactActivityCalendar } from "react-activity-calendar";

export function ActivityCalendarView(props: {
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

export function ActivityCalendar(props: {
  data: {
    contributions: Array<{
      date: string;
      count: number;
      level: 0 | 1 | 2 | 3 | 4;
    }>;
  };
  breakpointOptions: unknown;
}) {
  return <ActivityCalendarView contributions={props.data.contributions} />;
}
