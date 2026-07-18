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
    <div data-github-profile-activity className="w-full overflow-x-auto">
      <ActivityCalendar
        data={props.contributions}
        blockMargin={2}
        blockSize={9}
        colorScheme="light"
        fontSize={10}
        showTotalCount={false}
        showWeekdayLabels={["mon", "wed", "fri"]}
      />
    </div>
  );
}
