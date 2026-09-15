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
import { catalogsHash } from "../../catalogsHash";
import { Outline } from "../../Outline";
import { TableData } from "../../TableData";
import { CatalogOutline } from "../CatalogOutline";
import { Configuration } from "../Configuration";
import { useGridStore } from "../useGridStore";
import { useRegistryData } from "../useRegistryData";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.catalogName || !params.registryName) throw new Response("Not found", { status: 404 });
  const registry = catalogsHash[params.catalogName]?.registries[params.registryName];
  if (!registry) {
    throw new Response("Not found", { status: 404 });
  }
  return null;
}

export default function RegistryConfiguration() {
  const [optionsByRegistry, setOptionsByRegistry] = useState<Record<string, unknown>>({});
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const [searchParams] = useSearchParams();
  if (!params.catalogName) throw new Response("Not found", { status: 404 });
  const { catalogName } = params;
  const registryName =
    params.registryName ??
    searchParams.get("registry") ??
    Object.keys(catalogsHash[catalogName]?.registries ?? {})[0];
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const catalog = catalogsHash[catalogName];
  const registry = registryName ? catalog?.registries[registryName] : undefined;

  if (!catalog || !registry || !registryName) {
    throw new Response("Not found", { status: 404 });
  }

  const [registryData, setRegistryData] = useRegistryData(catalogName, registryName);
  const brick = registry;
  const BrickComponent = brick.component;
  const appearanceOptions =
    optionsByRegistry[`${catalogName}/${registryName}`] ?? BrickComponent.form?.defaultValue ?? {};
  const AppearanceForm = BrickComponent.form?.form;

  return (
    <section data-testid="registry-configuration-pane">
      <Outline.Title>
        <Link to={`/catalogs/${encodeURIComponent(catalogName)}`}>{catalog.catalogLabel}</Link>
      </Outline.Title>
      <CatalogOutline
        catalog={catalog}
        renderRegistry={(name, label) => (
          <Link
            to={`/catalogs/${encodeURIComponent(catalogName)}?registry=${encodeURIComponent(name)}`}
            aria-current={name === registryName ? "true" : undefined}
            className="underline aria-[current=true]:no-underline"
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
            { label: "Registry name", value: registry.registryName },
            { label: "Registry ID", value: registryName },
            {
              label: "Registry description",
              value: registry.registryDescription,
            },
          ]}
        />
      </div>
      <div className="sticky top-0 z-10 overflow-auto bg-white py-6">
        <div className={brick.def.w === 8 ? undefined : "px-4"}>
          <BrickPreviewFrame w={brick.def.w} h={brick.def.h}>
            <div
              className="size-full qrk-bricks brick-drag-surface overflow-hidden"
              data-registry-brick={`${catalogName}/${registryName}`}
              style={{ clipPath: "inset(0)" }}
              draggable
              onDragStart={(event) => {
                setActiveBrickDrag({
                  ...brick.def,
                  data: structuredClone(registryData),
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
                event.dataTransfer.setData("text/plain", brick.def.registry);
              }}
              onDragEnd={() => setActiveBrickDrag(null)}
            >
              <div className="brick-drag-content size-full select-none">
                <BrickComponent
                  breakpoint={breakpoint}
                  data={registryData}
                  appearanceOptions={appearanceOptions}
                />
              </div>
            </div>
          </BrickPreviewFrame>
        </div>
      </div>
      <div className="pb-6">
        <Configuration
          registry={registry}
          data={registryData}
          setData={setRegistryData}
          showData={false}
        />
        {AppearanceForm && (
          <>
            <Outline.Title>Appearance options</Outline.Title>
            <AppearanceForm
              value={appearanceOptions}
              onChange={(value) => {
                setOptionsByRegistry((current) => ({
                  ...current,
                  [`${catalogName}/${registryName}`]: value,
                }));
              }}
            />
          </>
        )}
        <Outline.Title>Brick Definition</Outline.Title>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="registry-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ ...brick.def, data: registryData, appearanceOptions }}
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
    <div className="px-6 pt-6" data-testid="registry-not-found">
      <Link
        to={`/catalogs/${encodeURIComponent(catalogName)}`}
        className="inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to catalog</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Registry not found</h1>
      <p className="mt-0 text-zinc-600">This registry is not registered in the catalog.</p>
    </div>
  );
}
