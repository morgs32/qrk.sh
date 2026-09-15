import { useState } from "react";

import { Pencil } from "lucide-react";
import { Link } from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { catalogsHash } from "../../catalogsHash";
import { Outline } from "../../Outline";
import { Button } from "../../ui/button";
import { CatalogOutline } from "../CatalogOutline";
import { DraggableBrick } from "../DraggableBrick";

export default function CatalogsPage() {
  const { breakpoint } = useBrickBreakpoint();
  const catalogs = Object.values(catalogsHash);
  const [selectedRegistries, setSelectedRegistries] = useState<Record<string, string>>({});

  return (
    <div aria-label="Brick catalogs" className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16">
        {catalogs.map((catalog) => {
          const registries = Object.entries(catalog.registries);
          const firstRegistryEntry = registries[0];

          if (!firstRegistryEntry) {
            return null;
          }

          const [firstRegistryName, firstRegistry] = firstRegistryEntry;
          const selectedRegistryName = selectedRegistries[catalog.catalogName] ?? firstRegistryName;
          const selectedRegistry = catalog.registries[selectedRegistryName] ?? firstRegistry;
          const { def, component: BrickComponent } = selectedRegistry;

          return (
            <div key={catalog.catalogName} data-catalog-entry={catalog.catalogName}>
              <Outline.Title sticky>
                <Link
                  to={`/catalogs/${encodeURIComponent(catalog.catalogName)}`}
                  data-catalog-link={catalog.catalogName}
                >
                  {catalog.catalogLabel}
                </Link>
              </Outline.Title>
              <CatalogOutline
                catalog={catalog}
                renderRegistry={(registryName, label) => (
                  <Button
                    variant="link"
                    aria-pressed={selectedRegistryName === registryName}
                    onClick={() => {
                      setSelectedRegistries((current) => ({
                        ...current,
                        [catalog.catalogName]: registryName,
                      }));
                    }}
                    className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                  >
                    {label}
                  </Button>
                )}
              />
              <div className="overflow-auto bg-white py-6">
                <div className={def.w === 8 ? undefined : "px-4"}>
                  <BrickPreviewFrame w={def.w} h={def.h}>
                    <DraggableBrick
                      brickDef={def}
                      className="size-full qrk-bricks overflow-hidden"
                      data-catalog-representative={`${def.catalogName}/${def.registry}`}
                    >
                      <div className="brick-drag-content size-full">
                        <BrickComponent breakpoint={breakpoint} data={def.data} />
                      </div>
                      <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                        <Link
                          aria-label="Configure registry"
                          to={`/catalogs/${encodeURIComponent(def.catalogName)}?registry=${encodeURIComponent(def.registry)}`}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Link>
                      </Button>
                    </DraggableBrick>
                  </BrickPreviewFrame>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
