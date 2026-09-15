import { useState } from "react";

import { ArrowLeft } from "lucide-react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  type LoaderFunctionArgs,
  useRouteError} from "react-router";

import { useBrickBreakpoint } from "../../BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../BrickPreviewFrame";
import { modulesHash } from "../../modulesHash";
import { Outline } from "../../components/outline/Outline";
import { TableData } from "../TableData";
import { Configuration } from "../Configuration";
import { useGridStore } from "../useGridStore";
import { useModuleData } from "../useModuleData";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  if (!modulesHash[params.moduleId]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function ModuleConfiguration() {
  const [optionsByModule, setOptionsByModule] = useState<Record<string, unknown>>({});
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  const { moduleId } = params;
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const module = modulesHash[moduleId];

  if (!module) {
    throw new Response("Not found", { status: 404 });
  }

  const [moduleData, setModuleData] = useModuleData(moduleId);
  const brick = module;
  const BrickComponent = brick.component;
  const appearanceOptions =
    optionsByModule[moduleId] ?? BrickComponent.form?.defaultValue ?? {};
  const AppearanceForm = BrickComponent.form?.form;

  return (
    <section data-testid="module-configuration-pane">
      <Outline.Title>
        <Link to={`/modules/${encodeURIComponent(moduleId)}`}>{module.label}</Link>
      </Outline.Title>
      <div className="px-4">
        <TableData
          entries={[
            { label: "Module name", value: module.label },
            { label: "Module ID", value: module.id },
            { label: "Module description", value: module.description },
          ]}
        />
      </div>
      <div className="overflow-auto bg-white py-6">
        <div className={brick.def[breakpoint].w === 8 ? undefined : "px-4"}>
          <BrickPreviewFrame w={brick.def[breakpoint].w} h={brick.def[breakpoint].h}>
            <div
              className="size-full qrk-bricks brick-drag-surface overflow-hidden"
              data-module-brick={moduleId}
              style={{ clipPath: "inset(0)" }}
              draggable
              onDragStart={(event) => {
                setActiveBrickDrag({
                  ...brick.def,
                  data: structuredClone(moduleData),
                  appearanceOptions: structuredClone(appearanceOptions)});
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
                event.dataTransfer.setData("text/plain", brick.def.moduleId);
              }}
              onDragEnd={() => setActiveBrickDrag(null)}
            >
              <div className="brick-drag-content size-full select-none">
                <BrickComponent
                  breakpoint={breakpoint}
                  data={moduleData}
                  appearanceOptions={appearanceOptions}
                />
              </div>
            </div>
          </BrickPreviewFrame>
        </div>
      </div>
      <div className="pb-6">
        <Configuration
          module={module}
          data={moduleData}
          setData={setModuleData}
          showData={false}
        />
        {AppearanceForm && (
          <>
            <Outline.Title>Appearance options</Outline.Title>
            <AppearanceForm
              value={appearanceOptions}
              onChange={(value) => {
                setOptionsByModule((current) => ({
                  ...current,
                  [moduleId]: value}));
              }}
            />
          </>
        )}
        <Outline.Title>Brick Definition</Outline.Title>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ ...brick.def, data: moduleData, appearanceOptions }}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;

  return (
    <div className="px-6 pt-6" data-testid="module-not-found">
      <Link to="/" className="inline-flex items-center gap-2 text-sm">
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to modules</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Module not found</h1>
      <p className="mt-0 text-zinc-600">This module is not registered in the library.</p>
    </div>
  );
}
