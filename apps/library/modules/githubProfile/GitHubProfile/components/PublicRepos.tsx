import { BookOpen } from "lucide-react";
import { brickMetaIconClass } from "../../../../components/brick/brickTokens";
import { makeComponentView } from "../../../../make/makeComponentView";
import { publicReposComponent } from "../../generator/PublicReposComponent";

export const publicReposView = makeComponentView(publicReposComponent, {
  component(props) {
    const { public_repos } = props;
    return (
      <div
        data-github-profile-json-render="PublicRepos"
        className="flex min-w-0 items-center gap-1"
        title="Repositories"
        aria-label={`${public_repos} repositories`}
      >
        <BookOpen className={brickMetaIconClass} aria-hidden="true" />
        <span className="truncate">{public_repos}</span>
      </div>
    );
  },
});
