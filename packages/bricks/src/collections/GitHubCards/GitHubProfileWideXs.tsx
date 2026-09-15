import { Image } from "@unpic/react";
import { ActivityCalendar } from "react-activity-calendar";
import { BrickFrame } from "../../BrickFrame";

export function GitHubProfileWideXs(props: {
  breakpoint: "xs" | "sm" | "lg" | "xl";
  data: {
    login: string;
    avatar_url: string;
    name: string | null;
    bio: string | null;
    location: string | null;
    blog: string;
    public_repos: number;
    followers: number;
    following: number;
    contributions: Array<{
      date: string;
      count: number;
      level: 0 | 1 | 2 | 3 | 4;
    }>;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div data-brick-breakpoint={props.breakpoint} className="flex h-full w-full flex-col">
        <div
          data-github-profile-activity
          className="h-1/2 w-full shrink-0 [&>article]:h-full [&>article]:w-full! [&>article>div]:h-full [&>article>div]:pt-0! [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-none [&_rect]:stroke-none!"
        >
          <ActivityCalendar
            data={props.data.contributions}
            blockMargin={1}
            blockRadius={0}
            blockSize={2}
            colorScheme="light"
            fontSize={10}
            showTotalCount={false}
            showMonthLabels={false}
            showColorLegend={false}
            showWeekdayLabels={false}
          />
        </div>{" "}
        <div className="flex h-1/2 shrink-0 items-center gap-1.5 px-2 text-xs font-medium">
          <Image
            src={props.data.avatar_url}
            alt=""
            width={20}
            height={20}
            className="size-5 shrink-0 rounded-full object-cover"
          />
          <span className="truncate">@{props.data.login}</span>
        </div>
      </div>
    </BrickFrame>
  );
}
