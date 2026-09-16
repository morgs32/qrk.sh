import { Quote } from "lucide-react";

import { brickMetaIconClass } from "../../../components/brick/brickTokens";

export function Bio(props: { bio: string | null }) {
  if (!props.bio) {
    return null;
  }

  return (
    <div data-github-profile-json-render="Bio" className="flex items-center gap-1">
      <Quote className={brickMetaIconClass} />
      <p className="m-0 truncate">{props.bio}</p>
    </div>
  );
}
