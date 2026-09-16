import type { ReactNode } from "react";

export function ProfileHeader(props: { children?: ReactNode }) {
  return (
    <div data-github-profile-json-render="ProfileHeader" className="flex min-w-0 shrink-0 items-center gap-2">
      {props.children}
    </div>
  );
}
