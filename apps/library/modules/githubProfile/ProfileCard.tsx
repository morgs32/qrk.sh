import type { ReactNode } from "react";

import { BrickShell } from "../../components/brick/BrickShell";

export function ProfileCard(props: { children?: ReactNode }) {
  return <BrickShell data-github-profile-json-render="ProfileCard">{props.children}</BrickShell>;
}
