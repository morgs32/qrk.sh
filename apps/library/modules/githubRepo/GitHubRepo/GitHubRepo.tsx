import { GitFork, Star } from "lucide-react";

import { BrickBody } from "../../../components/brick/BrickBody";
import { BrickFooter } from "../../../components/brick/BrickFooter";
import { BrickShell } from "../../../components/brick/BrickShell";
import { brickMetaIconClass } from "../../../components/brick/brickTokens";
import { Row } from "../../../components/Row";

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

export function RepoName(props: { name: string }) {
  return <h3 className="min-w-0 shrink-0 break-words [margin-block-end:0]">{props.name}</h3>;
}

export function RepoDescription(props: { description: string | null }) {
  const description = props.description === null ? "" : props.description.trim();
  if (description.length === 0) {
    return null;
  }
  return <p className="min-w-0 [margin-block-start:0] [overflow-wrap:anywhere]">{description}</p>;
}

export function RepoStars(props: { stargazers_count: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Star className={brickMetaIconClass} />
      <span>{props.stargazers_count}</span>
    </div>
  );
}

export function RepoForks(props: { forks_count: number }) {
  if (props.forks_count <= 0) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <GitFork className={brickMetaIconClass} />
      <span>{props.forks_count}</span>
    </div>
  );
}

export function RepoLanguage(props: { language: string | null }) {
  if (props.language === null) {
    return null;
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{
          backgroundColor: LANGUAGE_DOT_COLOR[props.language] ?? "#8b8b8b",
        }}
      />
      <span className="truncate">{props.language}</span>
    </div>
  );
}

export function GitHubRepo(props: {
  state: {
    payload: { url: string };
    data: {
      name: string;
      description: string | null;
      stargazers_count: number;
      forks_count: number;
      language: string | null;
    };
  };
}) {
  return (
    <BrickShell className="min-w-0">
      <BrickBody>
        <RepoName name={props.state.data.name} />
        <RepoDescription description={props.state.data.description} />
      </BrickBody>
      <BrickFooter>
        <Row className="w-full" gap={4}>
          <RepoStars stargazers_count={props.state.data.stargazers_count} />
          <RepoForks forks_count={props.state.data.forks_count} />
          <RepoLanguage language={props.state.data.language} />
        </Row>
      </BrickFooter>
    </BrickShell>
  );
}
