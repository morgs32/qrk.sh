import { Star } from "lucide-react";
import { brickMetaIconClass } from "../../../../components/brick/brickTokens";
import { makeComponentView } from "../../../../make/makeComponentView";
import { repoStarsComponent } from "../../generator/RepoStarsComponent";

export const repoStarsView = makeComponentView(repoStarsComponent, {
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
