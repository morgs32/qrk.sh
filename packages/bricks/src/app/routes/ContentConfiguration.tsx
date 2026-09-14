import { CollectionOptions } from "../CollectionOptions";
import { useState } from "react";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { GripHorizontal } from "lucide-react";
import { Button } from "../../ui/button";
import { collectionsHash } from "../../collectionsHash";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  useSearchParams,
  type LoaderFunctionArgs,
  useRouteError,
} from "react-router";
import { ArrowLeft } from "lucide-react";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { TableData } from "../../TableData";
import { Configuration } from "../Configuration";
import { useContentData } from "../useContentData";
import { useGridStore } from "../useGridStore";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.collectionName || !params.contentName)
    throw new Response("Not found", { status: 404 });
  const content = collectionsHash[params.collectionName]?.contents[params.contentName];
  if (!content || Object.keys(content.views).length === 0) {
    throw new Response("Not found", { status: 404 });
  }
  return null;
}

export default function ContentConfiguration() {
  const [optionsByView, setOptionsByView] = useState<Record<string, unknown>>({});
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const [searchParams] = useSearchParams();
  if (!params.collectionName) throw new Response("Not found", { status: 404 });
  const { collectionName } = params;
  const contentName =
    params.contentName ??
    searchParams.get("content") ??
    Object.keys(collectionsHash[collectionName]?.contents ?? {})[0];
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = collectionsHash[collectionName];
  const content = contentName ? collection?.contents[contentName] : undefined;

  if (!collection || !content || !contentName) {
    throw new Response("Not found", { status: 404 });
  }

  const [contentData, setContentData] = useContentData(collectionName, contentName);
  const views = Object.entries(content.views);
  const firstView = views[0];

  if (!firstView) {
    throw new Response("Not found", { status: 404 });
  }

  const viewName = searchParams.get("view") ?? firstView[0];
  const brick = content.views[viewName];
  if (!brick) throw new Response("Not found", { status: 404 });
  const BrickComponent = brick.component;
  const viewOptions = optionsByView[viewName] ?? BrickComponent.form?.defaultValue ?? {};
  const ViewForm = BrickComponent.form?.form;

  return (
    <section data-testid="content-configuration-pane">
      <OrderedTableOfContents.Title>
        <Link to={`/collections/${encodeURIComponent(collectionName)}`}>
          {collection.collectionLabel}
        </Link>
      </OrderedTableOfContents.Title>
      <CollectionOptions
        collection={collection}
        renderContent={(name, label) => (
          <Link
            to={`/collections/${encodeURIComponent(collectionName)}?content=${encodeURIComponent(name)}`}
            aria-current={name === contentName ? "true" : undefined}
            className="underline aria-[current=true]:no-underline"
          >
            {label}
          </Link>
        )}
        renderView={(name, view, label) => (
          <Link
            to={`/collections/${encodeURIComponent(collectionName)}?content=${encodeURIComponent(name)}&view=${encodeURIComponent(view)}`}
            aria-current={
              name === contentName && view === viewName ? "true" : undefined
            }
            className="underline aria-[current=true]:font-bold aria-[current=true]:text-zinc-950! aria-[current=true]:no-underline!"
          >
            {label}
          </Link>
        )}
      />
      <div className="pt-6">
        <TableData
          entries={[
            { label: "Collection name", value: collection.collectionLabel },
            { label: "Collection ID", value: collection.collectionName },
            { label: "Collection description", value: collection.collectionDescription },
            { label: "Content name", value: content.contentName },
            { label: "Content ID", value: contentName },
            { label: "Content description", value: content.contentDescription },
          ]}
        />
      </div>
      <div className="sticky top-0 z-10 overflow-auto bg-white py-6">
        <div className={brick.def.w === 8 ? undefined : "ml-6"}>
          <BrickPreviewFrame w={brick.def.w} h={brick.def.h}>
            <div
              className="size-full qrk-bricks brick-drag-surface overflow-hidden"
              data-content-view-brick={`${collectionName}/${contentName}/${viewName}`}
              style={{ clipPath: "inset(0)" }}
            >
              <div className="brick-drag-content size-full select-none">
                <BrickComponent
                  breakpoint={breakpoint}
                  data={contentData}
                  viewOptions={viewOptions}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="brick-drag-handle"
                aria-label="Drag brick"
                draggable
                onDragStart={(event) => {
                  setActiveBrickDrag({
                    ...brick.def,
                    data: structuredClone(contentData),
                    viewOptions: structuredClone(viewOptions),
                  });
                  const surface = event.currentTarget.parentElement;
                  if (surface) {
                    const bounds = surface.getBoundingClientRect();
                    event.dataTransfer.setDragImage(
                      surface,
                      event.clientX - bounds.left,
                      event.clientY - bounds.top,
                    );
                  }
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("text/plain", brick.def.view);
                }}
                onDragEnd={() => setActiveBrickDrag(null)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <GripHorizontal aria-hidden className="size-4" />
              </Button>
            </div>
          </BrickPreviewFrame>
        </div>
      </div>
      <div className="pb-6">
        <Configuration content={content} data={contentData} setData={setContentData} />
        {ViewForm && (
          <ViewForm
            value={viewOptions}
            onChange={(value) => {
              setOptionsByView((current) => ({ ...current, [viewName]: value }));
            }}
          />
        )}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const params = useParams();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  const collectionName = params.collectionName ?? "";

  return (
    <div className="px-6 pt-6" data-testid="content-not-found">
      <Link
        to={`/collections/${encodeURIComponent(collectionName)}`}
        className="inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to collection</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Content not found</h1>
      <p className="mt-0 text-zinc-600">This content is not registered in the collection.</p>
    </div>
  );
}
