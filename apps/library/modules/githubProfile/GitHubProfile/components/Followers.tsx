import { Users } from "lucide-react";
import { brickMetaIconClass } from "../../../../components/brick/brickTokens";
import { makeComponentView } from "../../../../make/makeComponentView";
import { followersComponent } from "../../generator/FollowersComponent";

export const followersView = makeComponentView(followersComponent, {
  component(props) {
    const { followers } = props;
    return (
      <div
        data-github-profile-json-render="Followers"
        className="flex min-w-0 items-center gap-1"
        title="Followers"
        aria-label={`${followers} followers`}
      >
        <Users className={brickMetaIconClass} aria-hidden="true" />
        <span className="truncate">{followers}</span>
      </div>
    );
  },
});
