import { Link as LinkIcon, MapPin } from "lucide-react";

import { brickMetaIconClass } from "../../../components/brick/brickTokens";

export function MetaRow(props: { location: string | null; blog: string }) {
  const hasLocation = Boolean(props.location);
  const hasBlog = Boolean(props.blog);

  if (!hasLocation && !hasBlog) {
    return null;
  }

  return (
    <div data-github-profile-json-render="MetaRow" className="flex flex-col gap-1">
      {hasLocation ? (
        <div className="flex items-center gap-1">
          <MapPin className={brickMetaIconClass} />
          <span className="truncate">{props.location}</span>
        </div>
      ) : null}
      {hasBlog ? (
        <a
          href={props.blog.startsWith("http") ? props.blog : `https://${props.blog}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex cursor-pointer items-center gap-1"
        >
          <LinkIcon className={brickMetaIconClass} />
          <span className="truncate">{props.blog.replace(/^https?:\/\//, "")}</span>
        </a>
      ) : null}
    </div>
  );
}
