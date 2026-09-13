import { collectionsHash } from "@qrk.sh/bricks";
import { Link, useParams } from "react-router";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { TableData } from "../../TableData";
import { useGridStore } from "../useGridStore";

export default function CollectionCatalog() {
  const params = useParams();
  if (!params.collectionName) throw new Response("Not found", { status: 404 });
  const { collectionName } = params;
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = Object.values(collectionsHash).find(
    (candidate) => candidate.collectionName === collectionName,
  );

  if (!collection) {
    throw new Response("Not found", { status: 404 });
  }

  return (
    <>
      <TableData
        entries={[
          { label: "Name", value: collection.collectionLabel },
          { label: "ID", value: collection.collectionName },
          { label: "Description", value: collection.collectionDescription },
        ]}
      />
      <div className="max-h-[calc(100dvh-16rem)] overflow-y-auto overscroll-contain">
        <OrderedTableOfContents.List>
          {Object.entries(collection.variants).map(([variantName, variant]) => (
            <OrderedTableOfContents.Item key={variantName}>
              <OrderedTableOfContents.Label sticky>
                <Link
                  to={`/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(variantName)}`}
                >
                  {variantName}
                </Link>
              </OrderedTableOfContents.Label>
              <div className="max-h-[calc(100dvh-22rem)] overflow-y-auto overscroll-contain">
                <OrderedTableOfContents.List>
                  {Object.values(variant.sizes).map((brick) => {
                    const BrickComponent = brick.component;

                    return (
                      <OrderedTableOfContents.Item key={brick.def.size}>
                        <OrderedTableOfContents.Rows sticky>
                          <OrderedTableOfContents.Label>
                            <span>{brick.def.size}</span>{" "}
                            <Link
                              to={`/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(variantName)}`}
                            >
                              Configure
                            </Link>
                          </OrderedTableOfContents.Label>
                        </OrderedTableOfContents.Rows>
                        <OrderedTableOfContents.Preview>
                          <div
                            className={
                              brick.def.w === 8
                                ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                                : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                            }
                            data-brick-full-size={`${brick.def.collectionName}/${brick.def.variant}/${brick.def.size}`}
                            draggable
                            onDragStart={(event) => {
                              setActiveBrickDrag(brick.def);
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("text/plain", brick.def.size);
                            }}
                            onDragEnd={() => {
                              setActiveBrickDrag(null);
                            }}
                            style={{
                              width: `${(brick.def.w / 8) * 100}%`,
                              aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                            }}
                          >
                            {variant.defaultData === undefined ? (
                              <BrickComponent />
                            ) : (
                              <BrickComponent data={variant.defaultData} />
                            )}
                          </div>
                        </OrderedTableOfContents.Preview>
                      </OrderedTableOfContents.Item>
                    );
                  })}
                </OrderedTableOfContents.List>
              </div>
            </OrderedTableOfContents.Item>
          ))}
        </OrderedTableOfContents.List>
      </div>
    </>
  );
}
