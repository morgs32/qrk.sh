"use client";

import { ActivityCalendar } from "react-activity-calendar";

export function GitHubProfileActivity(props: {
  breakpoint?: "xs" | "sm" | "md" | "lg";
  contributions: Array<{
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }>;
}) {
  const compact = props.breakpoint === "xs";

  return (
    <div
      data-github-profile-activity
      className={
        compact
          ? "mt-auto w-full overflow-x-auto [&>article>div]:pt-0! [&_rect]:stroke-none!"
          : "w-full overflow-x-auto [&_[class$=legend-colors]]:ml-0!"
      }
      style={
        compact
          ? undefined
          : {
              maskImage: "linear-gradient(to right, black calc(100% - 20px), transparent)",
            }
      }
    >
      <ActivityCalendar
        data={props.contributions}
        blockMargin={compact ? 1 : 2}
        blockRadius={compact ? 0 : 2}
        blockSize={compact ? 2 : 9}
        colorScheme="light"
        fontSize={10}
        showTotalCount={false}
        showMonthLabels={!compact}
        showColorLegend={!compact}
        showWeekdayLabels={compact ? false : ["mon", "wed", "fri"]}
      />
    </div>
  );
}
