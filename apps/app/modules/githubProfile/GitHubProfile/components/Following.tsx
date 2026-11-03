import { UserPlus } from "lucide-react";
import { brickMetaIconClass } from "../../../components/brick/brickTokens";
import { makeComponentView } from "../../../make/makeComponentView";
import { followingComponentMetadata } from "@qrk.sh/zerospin/src/modules/githubProfile/generator/FollowingComponentMetadata";

export const followingView = makeComponentView(followingComponentMetadata, {
  component(props) {
    const { following } = props;
    return (
      <div
        data-github-profile-json-render="Following"
        className="flex min-w-0 items-center gap-1"
        title="Following"
        aria-label={`${following} following`}
      >
        <UserPlus className={brickMetaIconClass} aria-hidden="true" />
        <span className="truncate">{following}</span>
      </div>
    );
  },
});
