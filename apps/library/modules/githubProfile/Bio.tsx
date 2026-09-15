import { Quote } from "lucide-react";

export function Bio(props: { bio: string | null }) {
  if (!props.bio) {
    return null;
  }

  return (
    <div
      data-github-profile-json-render="Bio"
      className="flex items-center gap-1 text-xs text-zinc-500"
    >
      <Quote className="size-3.5 shrink-0" />
      <span className="truncate">{props.bio}</span>
    </div>
  );
}
