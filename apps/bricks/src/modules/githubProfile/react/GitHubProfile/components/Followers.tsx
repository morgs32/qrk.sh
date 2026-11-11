import { Users } from "lucide-react";
import { brickMetaIconClass } from "../../../../../components/brickTokens";
import { makeComponentView } from "../../../../react/makeComponentView";
import { followersComponentMetadata } from "../../../definition/generator/FollowersComponentMetadata";

export const followersView = makeComponentView(followersComponentMetadata, {
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
