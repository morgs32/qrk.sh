import { defineRegistry } from "@json-render/react";
import { GitFork, Star } from "lucide-react";

import { brickMetaIconClass } from "../../../components/brick/brickTokens";
import { BrickShell } from "../../../components/brick/BrickShell";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { githubRepoJsonRenderCatalog } from "./GitHubRepoJsonRenderCatalog";

const LANGUAGE_DOT_COLOR: Record<string, string> = {
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

export const { registry } = defineRegistry(githubRepoJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    BrickShell: ({ children }) => <BrickShell className="min-w-0">{children}</BrickShell>,
    RepoName: ({ props }) => (
      <h3 className="min-w-0 shrink-0 break-words [margin-block-end:0]">
        {typeof props.name === "string" ? props.name : ""}
      </h3>
    ),
    RepoDescription: ({ props }) => {
      const description =
        typeof props.description === "string" ? props.description.trim() : "";
      if (description.length === 0) {
        return null;
      }
      return (
        <p className="min-w-0 [margin-block-start:0] [overflow-wrap:anywhere]">{description}</p>
      );
    },
    RepoStars: ({ props }) => (
      <div className="flex shrink-0 items-center gap-1">
        <Star className={brickMetaIconClass} />
        <span>{typeof props.stargazers_count === "number" ? props.stargazers_count : 0}</span>
      </div>
    ),
    RepoForks: ({ props }) => {
      const forks = typeof props.forks_count === "number" ? props.forks_count : 0;
      if (forks <= 0) {
        return null;
      }
      return (
        <div className="flex shrink-0 items-center gap-1">
          <GitFork className={brickMetaIconClass} />
          <span>{forks}</span>
        </div>
      );
    },
    RepoLanguage: ({ props }) => {
      const language = typeof props.language === "string" ? props.language : null;
      if (language === null) {
        return null;
      }
      return (
        <div className="flex min-w-0 items-center gap-1">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{
              backgroundColor: LANGUAGE_DOT_COLOR[language] ?? "#8b8b8b",
            }}
          />
          <span className="truncate">{language}</span>
        </div>
      );
    },
  },
});
