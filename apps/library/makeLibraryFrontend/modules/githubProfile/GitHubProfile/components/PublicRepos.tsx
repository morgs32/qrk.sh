import { BookOpen } from "lucide-react";

import { brickMetaIconClass } from "../../../../components/brick/brickTokens";

export function PublicRepos(props: { public_repos: number }) {
  return (
    <div
      data-github-profile-json-render="PublicRepos"
      className="flex min-w-0 items-center gap-1"
      title="Repositories"
      aria-label={`${props.public_repos} repositories`}
    >
      <BookOpen className={brickMetaIconClass} aria-hidden="true" />
      <span className="truncate">{props.public_repos}</span>
    </div>
  );
}
