import { useState } from "react";

import { ArrowLeft } from "lucide-react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  useSearchParams,
  type LoaderFunctionArgs,
  useRouteError,
} from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { groupsHash } from "../../groupsHash";
import { Outline } from "../../components/outline/Outline";
import { TableData } from "../TableData";
import { GroupOutline } from "../../components/outline/GroupOutline";
import { Configuration } from "../Configuration";
import { useGridStore } from "../useGridStore";
import { useCatalogData } from "../useCatalogData";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.groupName || !params.catalogName) throw new Response("Not found", { status: 404 });
  const catalog = groupsHash[params.groupName]?.catalogs[params.catalogName];
  if (!catalog) {
    throw new Response("Not found", { status: 404 });
  }
  return null;
}

export default function CatalogConfiguration() {
  const [optionsByCatalog, setOptionsByCatalog] = useState<Record<string, unknown>>({});
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const [searchParams] = useSearchParams();
  if (!params.groupName) throw new Response("Not found", { status: 404 });
  const { groupName } = params;
  const catalogName =
    params.catalogName ??
    searchParams.get("catalog") ??
    Object.keys(groupsHash[groupName]?.catalogs ?? {})[0];
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const group = groupsHash[groupName];
  const catalog = catalogName ? group?.catalogs[catalogName] : undefined;

  if (!group || !catalog || !catalogName) {
    throw new Response("Not found", { status: 404 });
  }

  const [catalogData, setCatalogData] = useCatalogData(groupName, catalogName);
  const brick = catalog;
  const BrickComponent = brick.component;
  const appearanceOptions =
    optionsByCatalog[`${groupName}/${catalogName}`] ?? BrickComponent.form?.defaultValue ?? {};
  const AppearanceForm = BrickComponent.form?.form;

  return (
    <section data-testid="catalog-configuration-pane">
      <Outline.Title>
        <Link to={`/groups/${encodeURIComponent(groupName)}`}>{group.label}</Link>
      </Outline.Title>
      <GroupOutline
        group={group}
        renderCatalog={(name, label) => (
          <Link
            to={`/groups/${encodeURIComponent(groupName)}?catalog=${encodeURIComponent(name)}`}
            aria-current={name === catalogName ? "true" : undefined}
            className="underline aria-[current=true]:no-underline"
          >
            {label}
          </Link>
        )}
      />
      <div className="px-4">
        <TableData
          entries={[
            { label: "Group name", value: group.label },
            { label: "Group ID", value: group.id },
            { label: "Group description", value: group.description },
            { label: "Catalog name", value: catalog.label },
            { label: "Catalog ID", value: catalogName },
            {
              label: "Catalog description",
              value: catalog.description,
            },
          ]}
        />
      </div>
      <div className="overflow-auto bg-white py-6">
        <div className={brick.def[breakpoint].w === 8 ? undefined : "px-4"}>
          <BrickPreviewFrame w={brick.def[breakpoint].w} h={brick.def[breakpoint].h}>
            <div
              className="size-full qrk-bricks brick-drag-surface overflow-hidden"
              data-catalog-brick={`${groupName}/${catalogName}`}
              style={{ clipPath: "inset(0)" }}
              draggable
              onDragStart={(event) => {
                setActiveBrickDrag({
                  ...brick.def,
                  data: structuredClone(catalogData),
                  appearanceOptions: structuredClone(appearanceOptions),
                });
                const surface = event.currentTarget;
                if (surface) {
                  const bounds = surface.getBoundingClientRect();
                  event.dataTransfer.setDragImage(
                    surface,
                    event.clientX - bounds.left,
                    event.clientY - bounds.top,
                  );
                }
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/plain", brick.def.catalogId);
              }}
              onDragEnd={() => setActiveBrickDrag(null)}
            >
              <div className="brick-drag-content size-full select-none">
                <BrickComponent
                  breakpoint={breakpoint}
                  data={catalogData}
                  appearanceOptions={appearanceOptions}
                />
              </div>
            </div>
          </BrickPreviewFrame>
        </div>
      </div>
      <div className="pb-6">
        <Configuration
          catalog={catalog}
          data={catalogData}
          setData={setCatalogData}
          showData={false}
        />
        {AppearanceForm && (
          <>
            <Outline.Title>Appearance options</Outline.Title>
            <AppearanceForm
              value={appearanceOptions}
              onChange={(value) => {
                setOptionsByCatalog((current) => ({
                  ...current,
                  [`${groupName}/${catalogName}`]: value,
                }));
              }}
            />
          </>
        )}
        <Outline.Title>Brick Definition</Outline.Title>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="catalog-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ ...brick.def, data: catalogData, appearanceOptions }}
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
  const groupName = params.groupName ?? "";

  return (
    <div className="px-6 pt-6" data-testid="catalog-not-found">
      <Link
        to={`/groups/${encodeURIComponent(groupName)}`}
        className="inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to group</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Catalog not found</h1>
      <p className="mt-0 text-zinc-600">This catalog is not registered in the group.</p>
    </div>
  );
}
