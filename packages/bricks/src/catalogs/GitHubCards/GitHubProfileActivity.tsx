"use client";

import { ActivityCalendar } from "react-activity-calendar";

export function GitHubProfileActivity(props: {
  contributions: Array<{
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
  }>;
}) {
  return (
    <div
      data-github-profile-activity
      className="w-full overflow-x-auto [&_[class$=legend-colors]]:ml-0!"
      style={{ maskImage: "linear-gradient(to right, black calc(100% - 20px), transparent)" }}
    >
      <ActivityCalendar
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
