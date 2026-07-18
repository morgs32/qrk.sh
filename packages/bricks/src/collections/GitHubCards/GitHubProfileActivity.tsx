"use client";

import { ActivityCalendar } from "react-activity-calendar";

function generateContributionData() {
  const days = 26 * 7;
  const startDate = new Date("2025-11-02T00:00:00.000Z");
  const contributions = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + dayIndex);

    const level = (dayIndex * 7 + (dayIndex % 6)) % 5;
    contributions.push({
      date: date.toISOString().slice(0, 10),
      count: level * 3,
      level,
    });
  }

  return contributions;
}

export function GitHubProfileActivity() {
  const contributions = generateContributionData();

  return (
    <div data-github-profile-activity>
      <ActivityCalendar
        data={contributions}
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
