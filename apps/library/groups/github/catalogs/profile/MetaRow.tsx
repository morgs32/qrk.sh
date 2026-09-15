import { Link as LinkIcon, MapPin } from "lucide-react";

export function MetaRow(props: { location: string | null; blog: string }) {
  const hasLocation = Boolean(props.location);
  const hasBlog = Boolean(props.blog);

  if (!hasLocation && !hasBlog) {
    return null;
  }

  return (
    <div
      data-github-profile-json-render="MetaRow"
      className="flex flex-col gap-1 text-xs text-zinc-500"
    >
      {hasLocation ? (
        <div className="flex items-center gap-1">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{props.location}</span>
        </div>
      ) : null}
      {hasBlog ? (
        <a
          href={props.blog.startsWith("http") ? props.blog : `https://${props.blog}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex cursor-pointer items-center gap-1 transition-colors hover:text-blue-600"
        >
          <LinkIcon className="size-3.5 shrink-0" />
          <span className="truncate">{props.blog.replace(/^https?:\/\//, "")}</span>
        </a>
      ) : null}
    </div>
  );
}
