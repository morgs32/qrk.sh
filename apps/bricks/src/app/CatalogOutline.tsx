import type { ReactNode } from "react";

import { Outline } from "../Outline";
import type { ICatalog } from "../types";

export function CatalogOutline({
  catalog,
  renderRegistry,
}: {
  catalog: ICatalog;
  renderRegistry: (registryName: string, label: string) => ReactNode;
}) {
  return (
    <Outline>
      <Outline.List padded={false} spaced>
        {Object.entries(catalog.registries).map(([registryName, registry]) => (
          <Outline.Item key={registryName}>
            <Outline.Label>{renderRegistry(registryName, registry.registryName)}</Outline.Label>
          </Outline.Item>
        ))}
      </Outline.List>
    </Outline>
  );
}
