import { Link as LinkIcon } from "lucide-react";

import { brickMetaIconClass } from "../../../components/brick/brickTokens";

export function Blog(props: { blog: string }) {
  if (!props.blog) {
    return null;
  }

  return (
    <a
      data-github-profile-json-render="Blog"
      href={props.blog.startsWith("http") ? props.blog : `https://${props.blog}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex cursor-pointer items-center gap-1"
    >
      <LinkIcon className={brickMetaIconClass} />
      <span className="truncate">{props.blog.replace(/^https?:\/\//, "")}</span>
    </a>
  );
}
