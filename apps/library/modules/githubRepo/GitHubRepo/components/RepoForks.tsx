import { GitFork } from "lucide-react";
import { brickMetaIconClass } from "../../../../components/brick/brickTokens";
import { makeComponentView } from "../../../../make/makeComponentView";
import { repoForksComponent } from "../../generator/RepoForksComponent";

export const repoForksView = makeComponentView(repoForksComponent, {
  component(props) {
    const { forks_count } = props;
    if (forks_count <= 0) {
      return null;
    }
    return (
      <div className="flex shrink-0 items-center gap-1">
        <GitFork className={brickMetaIconClass} />
        <span>{forks_count}</span>
      </div>
    );
  },
});
