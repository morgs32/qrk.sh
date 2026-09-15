import type { ReactNode } from "react";

import { Outline } from "./Outline";
import type { IGroup } from "@qrk.sh/bricks";

export function GroupOutline({
  group,
  renderCatalog,
}: {
  group: IGroup;
  renderCatalog: (catalogName: string, label: string) => ReactNode;
}) {
  return (
    <Outline>
      <Outline.List padded={false} spaced>
        {Object.entries(group.catalogs).map(([catalogName, catalog]) => (
          <Outline.Item key={catalogName}>
            <Outline.Label>{renderCatalog(catalogName, catalog.label)}</Outline.Label>
          </Outline.Item>
        ))}
      </Outline.List>
    </Outline>
  );
}
