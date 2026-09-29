import { makeComponentView } from "../../../../make/makeComponentView";
import { repoLanguageComponent } from "../../generator/RepoLanguageComponent";

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

export const repoLanguageView = makeComponentView(repoLanguageComponent, {
  component(props) {
    const { language } = props;
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
});
