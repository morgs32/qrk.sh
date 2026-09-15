import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { CatalogOutline } from "../CatalogOutline";
import { useState } from "react";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { GripHorizontal } from "lucide-react";
import { Button } from "../../ui/button";
import { catalogsHash } from "../../catalogsHash";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  useSearchParams,
  type LoaderFunctionArgs,
  useRouteError,
} from "react-router";
import { ArrowLeft } from "lucide-react";

import { Outline } from "../../Outline";
import { TableData } from "../../TableData";
import { Configuration } from "../Configuration";
import { useContentData } from "../useContentData";
import { useGridStore } from "../useGridStore";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.catalogName || !params.contentName)
    throw new Response("Not found", { status: 404 });
  const content = catalogsHash[params.catalogName]?.contents[params.contentName];
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
  if (!params.catalogName) throw new Response("Not found", { status: 404 });
  const { catalogName } = params;
  const contentName =
    params.contentName ??
    searchParams.get("content") ??
    Object.keys(catalogsHash[catalogName]?.contents ?? {})[0];
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const catalog = catalogsHash[catalogName];
  const content = contentName ? catalog?.contents[contentName] : undefined;

  if (!catalog || !content || !contentName) {
    throw new Response("Not found", { status: 404 });
  }

  const [contentData, setContentData] = useContentData(catalogName, contentName);
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
      <Outline.Title>
        <Link to={`/catalogs/${encodeURIComponent(catalogName)}`}>
          {catalog.catalogLabel}
        </Link>
      </Outline.Title>
      <CatalogOutline
        catalog={catalog}
        renderContent={(name, label) => (
          <Link
            to={`/catalogs/${encodeURIComponent(catalogName)}?content=${encodeURIComponent(name)}`}
            aria-current={name === contentName ? "true" : undefined}
            className="underline aria-[current=true]:no-underline"
          >
            {label}
          </Link>
        )}
        renderView={(name, view, label) => (
          <Link
            to={`/catalogs/${encodeURIComponent(catalogName)}?content=${encodeURIComponent(name)}&view=${encodeURIComponent(view)}`}
            aria-current={name === contentName && view === viewName ? "true" : undefined}
            className="underline aria-[current=true]:font-bold aria-[current=true]:text-zinc-950! aria-[current=true]:no-underline!"
          >
            {label}
          </Link>
        )}
      />
      <div className="px-4">
        <TableData
          entries={[
            { label: "Catalog name", value: catalog.catalogLabel },
            { label: "Catalog ID", value: catalog.catalogName },
            { label: "Catalog description", value: catalog.catalogDescription },
            { label: "Content name", value: content.contentName },
            { label: "Content ID", value: contentName },
            { label: "Content description", value: content.contentDescription },
          ]}
        />
      </div>
      <div className="sticky top-0 z-10 overflow-auto bg-white py-6">
        <div className={brick.def.w === 8 ? undefined : "px-4"}>
          <BrickPreviewFrame w={brick.def.w} h={brick.def.h}>
            <div
              className="size-full qrk-bricks brick-drag-surface overflow-hidden"
              data-content-view-brick={`${catalogName}/${contentName}/${viewName}`}
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
        <Configuration content={content} data={contentData} setData={setContentData} showData={false} />
        {ViewForm && (
          <>
            <Outline.Title>View options</Outline.Title>
            <ViewForm
              value={viewOptions}
              onChange={(value) => {
                setOptionsByView((current) => ({ ...current, [viewName]: value }));
              }}
            />
          </>
        )}
        <Outline.Title>Brick Definition</Outline.Title>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="content-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ ...brick.def, data: contentData, viewOptions }}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const params = useParams();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  const catalogName = params.catalogName ?? "";

  return (
    <div className="px-6 pt-6" data-testid="content-not-found">
      <Link
        to={`/catalogs/${encodeURIComponent(catalogName)}`}
        className="inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to catalog</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Content not found</h1>
      <p className="mt-0 text-zinc-600">This content is not registered in the catalog.</p>
    </div>
  );
}
