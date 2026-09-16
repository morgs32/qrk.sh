import { MapPin } from "lucide-react";

import { brickMetaIconClass } from "../../../../components/brick/brickTokens";

export function Location(props: { location: string | null }) {
  if (!props.location) {
    return null;
  }

  return (
    <div data-github-profile-json-render="Location" className="flex items-center gap-1">
      <MapPin className={brickMetaIconClass} />
      <span className="truncate">{props.location}</span>
    </div>
  );
}
