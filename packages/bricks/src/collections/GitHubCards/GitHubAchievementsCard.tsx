import { Image } from "@unpic/react";

import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";

interface Achievement {
  id: string;
  name: string;
  image: string;
  gradient: string;
}

const achievements: Achievement[] = [
  {
    id: "starstruck",
    name: "Starstruck",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/starstruck-default.png",
    gradient: "from-amber-200 via-orange-200 to-rose-200",
  },
  {
    id: "pair-extraordinaire",
    name: "Pair Extraordinaire",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/pair-extraordinaire-default.png",
    gradient: "from-emerald-200 via-green-200 to-lime-200",
  },
  {
    id: "pull-shark",
    name: "Pull Shark",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/pull-shark-default.png",
    gradient: "from-cyan-200 via-sky-200 to-blue-200",
  },
  {
    id: "galaxy-brain",
    name: "Galaxy Brain",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/galaxy-brain-default.png",
    gradient: "from-purple-200 via-violet-200 to-fuchsia-200",
  },
  {
    id: "quickdraw",
    name: "Quickdraw",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/quickdraw-default.png",
    gradient: "from-indigo-200 via-purple-200 to-pink-200",
  },
  {
    id: "arctic-code-vault",
    name: "Arctic Code Vault",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/arctic-code-vault-contributor-default.png",
    gradient: "from-sky-200 via-blue-200 to-indigo-200",
  },
  {
    id: "yolo",
    name: "YOLO",
    image: "https://github.githubassets.com/images/modules/profile/achievements/yolo-default.png",
    gradient: "from-rose-200 via-pink-200 to-fuchsia-200",
  },
  {
    id: "public-sponsor",
    name: "Public Sponsor",
    image:
      "https://github.githubassets.com/images/modules/profile/achievements/public-sponsor-default.png",
    gradient: "from-pink-200 via-rose-200 to-red-200",
  },
];

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`h-14 w-14 rounded-full bg-gradient-to-br p-0.5 shadow-lg sm:h-16 sm:w-16 md:h-20 md:w-20 ${achievement.gradient}`}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-zinc-900">
          <Image
            src={achievement.image}
            alt={achievement.name}
            width={64}
            height={64}
            loading="eager"
            className="h-10 w-10 object-contain sm:h-12 sm:w-12 md:h-14 md:w-14"
          />
        </div>
      </div>
    </div>
  );
}

export function GitHubAchievementsCard() {
  return (
    <Card className="h-full min-h-0 w-full gap-2 overflow-hidden rounded-none border border-zinc-800 bg-zinc-950 py-3 shadow-none">
      <CardHeader className="shrink-0 px-4 pb-2 pt-0">
        <CardTitle className="text-lg font-semibold text-zinc-100">Achievements</CardTitle>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div className="grid grid-cols-4 gap-2 md:gap-4">
          {achievements.map((achievement) => (
            <AchievementBadge key={achievement.id} achievement={achievement} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
