import { useState } from "react";

import { ArrowLeft } from "lucide-react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  type LoaderFunctionArgs,
  useRouteError} from "react-router";

import { useBrickBreakpoint } from "../../../components/brick/BrickBreakpointProvider";
import { BrickPreviewFrame } from "../../../components/brick/BrickPreviewFrame";
import { modulesHash } from "../../../modulesHash";
import { GitHubProfileJsonRenderCompare } from "../../../modules/githubProfile/generative/GitHubProfileJsonRenderCompare";
import { TableData } from "../../TableData";
import { Configuration } from "../../Configuration";
import { useGridStore } from "../../useGridStore";
import { useModuleData } from "../../useModuleData";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  if (!modulesHash[params.moduleId]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function ModuleDetail() {
  const [optionsByModule, setOptionsByModule] = useState<Record<string, unknown>>({});
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  const { moduleId } = params;
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const brickModule = modulesHash[moduleId];

  if (!brickModule) {
    throw new Response("Not found", { status: 404 });
  }

  const [moduleData, setModuleData] = useModuleData(moduleId);
  const brick = brickModule;
  const BrickComponent = brick.component;
  const optionsConfig = BrickComponent.options;
  const options = optionsByModule[moduleId] ?? optionsConfig?.defaultValue;
  const OptionsForm = optionsConfig?.form;

  return (
    <section data-testid="module-configuration-pane">
      <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal sticky top-0 z-10">
        <Link to={`/modules/${encodeURIComponent(moduleId)}`}>{brickModule.label}</Link>
      </h2>
      <div className="px-4">
        <TableData
          entries={[
            { label: "Module name", value: brickModule.label },
            { label: "Module ID", value: brickModule.id },
            { label: "Module description", value: brickModule.description },
          ]}
        />
      </div>
      <div className="overflow-auto py-6">
        {moduleId === "github-profile" ? (
          <div className="flex w-full gap-4 px-4">
            <div
              className="min-w-0 w-1/2 overflow-hidden"
              style={{
                aspectRatio: `${brick.def[breakpoint].w} / ${brick.def[breakpoint].h}`,
              }}
            >
              <div
                className="size-full qrk-bricks brick-drag-surface overflow-hidden"
                data-module-brick={moduleId}
                style={{ clipPath: "inset(0)" }}
                draggable
                onDragStart={(event) => {
                  setActiveBrickDrag({
                    ...brick.def,
                    data: structuredClone(moduleData),
                    ...(options !== undefined ? { options: structuredClone(options) } : {}),
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
                  event.dataTransfer.setData("text/plain", brick.def.moduleId);
                }}
                onDragEnd={() => setActiveBrickDrag(null)}
              >
                <div className="brick-drag-content size-full select-none">
                  <BrickComponent
                    breakpoint={breakpoint}
                    data={moduleData}
                    options={options}
                  />
                </div>
              </div>
            </div>
            <div
              className="min-w-0 w-1/2 overflow-hidden"
              style={{
                aspectRatio: `${brick.def[breakpoint].w} / ${brick.def[breakpoint].h}`,
              }}
            >
              <GitHubProfileJsonRenderCompare data={moduleData} />
            </div>
          </div>
        ) : (
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
                    ...(options !== undefined ? { options: structuredClone(options) } : {}),
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
                  event.dataTransfer.setData("text/plain", brick.def.moduleId);
                }}
                onDragEnd={() => setActiveBrickDrag(null)}
              >
                <div className="brick-drag-content size-full select-none">
                  <BrickComponent
                    breakpoint={breakpoint}
                    data={moduleData}
                    options={options}
                  />
                </div>
              </div>
            </BrickPreviewFrame>
          </div>
        )}
      </div>
      <div className="pb-6">
        <Configuration
          brickModule={brickModule}
          data={moduleData}
          setData={setModuleData}
          showData={false}
        />
        {OptionsForm && (
          <>
            <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal">Options</h2>
            <OptionsForm
              value={options}
              onChange={(value) => {
                setOptionsByModule((current) => ({
                  ...current,
                  [moduleId]: value}));
              }}
            />
          </>
        )}
        <h2 className="m-0 shrink-0 bg-zinc-100 px-4 py-4 font-normal">Brick Definition</h2>
        <div className="overflow-auto bg-white px-2 py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{
              ...brick.def,
              data: moduleData,
              ...(options !== undefined ? { options } : {}),
            }}
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
      <Link to="/modules" className="inline-flex items-center gap-2">
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to modules</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Module not found</h1>
      <p className="mt-0">This module is not registered in the library.</p>
    </div>
  );
}
