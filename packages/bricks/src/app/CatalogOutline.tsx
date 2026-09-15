import type { ReactNode } from "react";
import { Outline } from "../Outline";
import type { ICatalog } from "../types";

export function CatalogOutline({
  catalog,
  renderContent,
  renderView,
}: {
  catalog: ICatalog;
  renderContent: (contentName: string, label: string) => ReactNode;
  renderView: (contentName: string, viewName: string, label: string) => ReactNode;
}) {
  return (
    <Outline>
      <Outline.List padded={false} spaced>
        {Object.entries(catalog.contents).map(([contentName, content]) => (
          <Outline.Item key={contentName}>
            <Outline.Label>
              {renderContent(contentName, content.contentName)}
            </Outline.Label>
            <div className="pt-2">
              <Outline.List padded={false}>
                {Object.entries(content.views).map(([viewName, brick]) => (
                  <Outline.Item key={viewName}>
                    <Outline.Label>
                      {renderView(contentName, viewName, brick.def.label)}
                    </Outline.Label>
                  </Outline.Item>
                ))}
              </Outline.List>
            </div>
          </Outline.Item>
        ))}
      </Outline.List>
    </Outline>
  );
}
