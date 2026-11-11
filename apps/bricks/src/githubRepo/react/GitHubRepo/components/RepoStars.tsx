import { Star } from "lucide-react";
import { brickMetaIconClass } from "../../../../react/brickTokens";
import { makeComponentView } from "../../../../react/makeComponentView";
import { repoStarsComponentMetadata } from "../../../definition/generator/RepoStarsComponentMetadata";

export const repoStarsView = makeComponentView(repoStarsComponentMetadata, {
  component(props) {
    const { stargazers_count } = props;
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Star className={brickMetaIconClass} />
        <span>{stargazers_count}</span>
      </div>
    );
  },
});
