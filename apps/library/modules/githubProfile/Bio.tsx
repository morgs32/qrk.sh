import { Quote } from "lucide-react";

import { brickMetaIconClass, brickMutedClass } from "../../brickTokens";

export function Bio(props: { bio: string | null }) {
  if (!props.bio) {
    return null;
  }

  return (
    <div
      data-github-profile-json-render="Bio"
      className={`flex items-center gap-1 ${brickMutedClass}`}
    >
      <Quote className={brickMetaIconClass} />
      <span className="truncate">{props.bio}</span>
    </div>
  );
}
