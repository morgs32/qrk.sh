import type { ReactNode } from "react";

import { BrickBody } from "../../../../components/brick/BrickBody";

export function ProfileBody(props: { children?: ReactNode }) {
  return <BrickBody data-github-profile-json-render="ProfileBody">{props.children}</BrickBody>;
}
