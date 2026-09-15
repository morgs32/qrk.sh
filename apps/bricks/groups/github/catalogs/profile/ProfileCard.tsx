import type { ReactNode } from "react";

export function ProfileCard(props: { children?: ReactNode }) {
  return (
    <div
      data-github-profile-json-render="ProfileCard"
      className="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden bg-white p-2 text-xs text-zinc-900"
    >
      {props.children}
    </div>
  );
}
