import { GitFork } from "lucide-react";
import { brickMetaIconClass } from "../../../../react/brickTokens";
import { makeComponentView } from "../../../../react/makeComponentView";
import { repoForksComponentMetadata } from "../../../definition/generator/RepoForksComponentMetadata";

export const repoForksView = makeComponentView(repoForksComponentMetadata, {
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
