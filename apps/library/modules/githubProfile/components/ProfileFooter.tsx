import type { ReactNode } from "react";

import { BrickFooter } from "../../../components/brick/BrickFooter";

export function ProfileFooter(props: { children?: ReactNode }) {
  return (
    <BrickFooter data-github-profile-json-render="ProfileFooter" className="justify-end gap-4">
      {props.children}
    </BrickFooter>
  );
}
