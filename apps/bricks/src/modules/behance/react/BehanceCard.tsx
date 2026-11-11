import { useState } from "react";

import { Link } from "../../../components/Link";
import { makeComponentView } from "../../react/makeComponentView";
import type { behanceProjectSchema } from "../definition/behanceSchemas";
import { behanceCardComponentMetadata } from "../definition/behanceV1";

function BehanceProject(props: { project: typeof behanceProjectSchema.Type }) {
  const { project } = props;
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <Link
      href={project.url}
      className="min-w-0 overflow-hidden rounded-md bg-zinc-100 text-zinc-900 hover:underline"
    >
      {coverFailed ? null : (
        <img
          src={project.coverUrl}
          alt=""
          loading="lazy"
          onError={() => setCoverFailed(true)}
          className="aspect-[4/3] w-full object-cover"
        />
      )}
      <span className="block px-2 py-1 text-xs font-medium break-words">{project.title}</span>
    </Link>
  );
}

export const behanceCardView = makeComponentView(behanceCardComponentMetadata, {
  component(props) {
    const { url, displayName, projects } = props;
    return (
      <div className="flex min-w-0 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <strong className="min-w-0 break-words text-sm">{displayName}</strong>
          <Link
            href={url}
            className="text-sm font-medium text-blue-700 underline dark:text-blue-300"
          >
            View on Behance
          </Link>
        </div>
        {projects.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {projects.map((project) => (
              <BehanceProject key={project.coverUrl + project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    );
  },
});
