"use client";

import useSWR from "swr";

import { Card, CardContent } from "../../ui/card";

const GITHUB_REPO_OWNER = "morgs32";
const GITHUB_REPO_NAME = "ink-steps";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  Ruby: "#701516",
  PHP: "#4F5D95",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Swift: "#ffac45",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  SCSS: "#c6538c",
  Less: "#1d365d",
  Makefile: "#427819",
  Dockerfile: "#384d54",
};

const getLanguageColor = (language: string): string => {
  return languageColors[language] || "#8b8b8b";
};

export function GitHubLanguagesCard() {
  const { data, error, isLoading } = useSWR(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/languages`,
    fetcher,
  );

  if (isLoading) {
    return (
      <Card className="border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="bg-muted h-20 w-20 animate-pulse rounded-full" />
            <div className="flex-1 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-muted h-3 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none">
        <CardContent className="p-3">
          <p className="text-muted-foreground text-xs">Failed to load languages</p>
        </CardContent>
      </Card>
    );
  }

  const totalBytes = Object.values(data as Record<string, number>).reduce(
    (acc, val) => acc + val,
    0,
  );

  const languages = Object.entries(data as Record<string, number>)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percentage: Math.round((bytes / totalBytes) * 100),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const threshold = 1;
  const mainLanguages = languages.filter((l) => l.percentage >= threshold);
  const otherLanguages = languages.filter((l) => l.percentage < threshold);
  const othersPercentage = otherLanguages.reduce((acc, l) => acc + l.percentage, 0);

  const displayLanguages =
    othersPercentage > 0
      ? [...mainLanguages, { name: "Others", bytes: 0, percentage: othersPercentage }]
      : mainLanguages;

  let cumulativePercentage = 0;
  const segments = displayLanguages.map((lang) => {
    const start = cumulativePercentage;
    cumulativePercentage += lang.percentage;
    return {
      ...lang,
      start,
      end: cumulativePercentage,
    };
  });

  const size = 72;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Card className="border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none">
      <CardContent className="min-h-0 flex-1 overflow-auto p-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <svg width={size} height={size} className="-rotate-90 transform">
              {segments.map((segment) => {
                const strokeDasharray = `${(segment.percentage / 100) * circumference} ${circumference}`;
                const strokeDashoffset = -(segment.start / 100) * circumference;
                return (
                  <circle
                    key={segment.name}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={getLanguageColor(segment.name)}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-300"
                  />
                );
              })}
            </svg>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-1 gap-1">
            {displayLanguages.map((lang) => (
              <div key={lang.name} className="flex items-center justify-between text-xs">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: getLanguageColor(lang.name) }}
                  />
                  <span className="text-foreground truncate">{lang.name}</span>
                </div>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {lang.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
