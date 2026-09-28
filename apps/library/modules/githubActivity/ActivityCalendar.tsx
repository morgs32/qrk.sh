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
      className="flex h-full w-full items-center overflow-hidden bg-white px-3 py-2 [&_[class$=legend-colors]]:ml-0!"
      style={{
        maskImage: "linear-gradient(to right, black calc(100% - 20px), transparent)",
      }}
    >
      <div className="flex w-full items-start">
        {/* Match the calendar's 18px month header, 11px row pitch, and 1px top padding. */}
        <svg width={26} height={94} className="shrink-0" fontSize={10}>
          {["Mon", "Wed", "Fri"].map((day, index) => (
            <text
              key={day}
              x={18}
              y={34.5 + index * 22}
              dominantBaseline="central"
              textAnchor="end"
              fill="currentColor"
            >
              {day}
            </text>
          ))}
        </svg>
        <ReactActivityCalendar
          className="min-w-0"
          data={props.contributions}
          blockMargin={2}
          blockRadius={2}
          blockSize={9}
          colorScheme="light"
          fontSize={10}
          showTotalCount={false}
          showMonthLabels={true}
          showColorLegend={true}
          showWeekdayLabels={false}
        />
      </div>
    </div>
  );
}

export function ActivityCalendar(props: {
  state: {
    payload: { url: string };
    data: {
      contributions: Array<{
        date: string;
        count: number;
        level: 0 | 1 | 2 | 3 | 4;
      }>;
    };
  };
}) {
  return <ActivityCalendarView contributions={props.state.data.contributions} />;
}
