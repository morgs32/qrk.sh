import type { ReactNode } from "react";
import { OrderedTableOfContents } from "../OrderedTableOfContents";
import type { ICollection } from "../types";

export function CollectionOptions({
  collection,
  renderContent,
  renderView,
}: {
  collection: ICollection;
  renderContent: (contentName: string, label: string) => ReactNode;
  renderView: (contentName: string, viewName: string, label: string) => ReactNode;
}) {
  return (
    <OrderedTableOfContents>
      <OrderedTableOfContents.List padded={false} spaced>
        {Object.entries(collection.contents).map(([contentName, content]) => (
          <OrderedTableOfContents.Item key={contentName}>
            <OrderedTableOfContents.Label>
              {renderContent(contentName, content.contentName)}
            </OrderedTableOfContents.Label>
            <div className="pt-2">
              <OrderedTableOfContents.List padded={false}>
                {Object.entries(content.views).map(([viewName, brick]) => (
                  <OrderedTableOfContents.Item key={viewName}>
                    <OrderedTableOfContents.Label>
                      {renderView(contentName, viewName, brick.def.label)}
                    </OrderedTableOfContents.Label>
                  </OrderedTableOfContents.Item>
                ))}
              </OrderedTableOfContents.List>
            </div>
          </OrderedTableOfContents.Item>
        ))}
      </OrderedTableOfContents.List>
    </OrderedTableOfContents>
  );
}
