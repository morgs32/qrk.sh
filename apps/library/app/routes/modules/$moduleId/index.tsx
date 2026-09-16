import { useState } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import type { Spec } from "@json-render/core";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { BrickBreakpointProvider } from "../../../../lib/BrickBreakpointProvider";
import { BrickPreview } from "../../../../lib/BrickPreview";
import { BREAKPOINTS } from "../../../../lib/breakpoints";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { modulesHash } from "../../../../lib/modulesHash";
import { GitHubProfileJsonRenderCompare } from "../../../../modules/githubProfile/generative/GitHubProfileJsonRenderCompare";
import type { LibraryApi } from "../../../../worker/LibraryApi.public";
import type { IScrapeError } from "../../../../worker/types.public";
import { TableData } from "../../../TableData";
import { Configuration } from "../../../Configuration";
import { useGridStore } from "../../../../lib/useGridStore";
import { useModuleData } from "../../../useModuleData";

export const Route = createFileRoute("/modules/$moduleId/")({
  component: ModuleDetail,
});

const nestedListClassName =
  "mt-10 list-outside marker:font-mono marker:text-neutral-400 pl-[29px] max-[480px]:pl-8 list-[lower-alpha]";

function ModuleDetail() {
  const [optionsByModule, setOptionsByModule] = useState<Record<string, unknown>>({});
  const { moduleId } = Route.useParams();
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const brickModule = modulesHash[moduleId];

  if (!brickModule) {
    throw notFound();
  }

  const [moduleData, setModuleData] = useModuleData(moduleId);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatedSpec, setGeneratedSpec] = useState<Spec>();
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();
  const brick = brickModule;
  const BrickComponent = brick.component;
  const optionsConfig = BrickComponent.options;
  const options = optionsByModule[moduleId] ?? optionsConfig?.defaultValue;
  const OptionsForm = optionsConfig?.form;

  return (
    <>
      <li data-testid="module-configuration-pane">
        <h2 className="m-0 shrink-0 font-normal">Module</h2>
        <div className="mt-5">
          <TableData
            entries={[
              { label: "Module ID", value: brickModule.id },
              { label: "Module description", value: brickModule.description },
            ]}
          />
        </div>
      </li>
      <li className="mt-10">
        <h2 className="m-0 shrink-0 font-normal">Previews</h2>
        <ol className={nestedListClassName}>
          {BREAKPOINTS.map((entry, index) => (
            <li className={index === 0 ? undefined : "mt-10"} key={entry.id}>
              <BrickBreakpointProvider>
                {({ containerRef }) => (
                  <>
                    <h2 className="m-0 shrink-0 py-2 font-normal">{entry.id}</h2>
                    <div ref={containerRef} style={{ width: entry.previewWidth }}>
                      <BrickPreview w={brick.def[entry.id].w} h={brick.def[entry.id].h}>
                        <div
                          className="size-full qrk-bricks brick-drag-surface overflow-hidden"
                          data-module-brick={moduleId}
                          data-testid="brick-preview"
                          draggable
                          onDragStart={(event) => {
                            setActiveBrickDrag({
                              ...brick.def,
                              data: structuredClone(moduleData),
                              ...(options !== undefined
                                ? { options: structuredClone(options) }
                                : {}),
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
                              breakpoint={entry.id}
                              data={moduleData}
                              options={options}
                            />
                          </div>
                        </div>
                      </BrickPreview>
                    </div>
                  </>
                )}
              </BrickBreakpointProvider>
            </li>
          ))}
        </ol>
      </li>
      {brickModule.catalog !== undefined ? (
        <li className="mt-10">
          <h2 className="m-0 shrink-0 px-4 py-4 font-normal">Generate spec</h2>
          <form
            className="flex flex-col items-start gap-2 px-4 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                setIsGeneratingSpec(true);
                setGenerateError(undefined);
                setGenerateRequestError(undefined);
                try {
                  using api = newSyncRpcSession<LibraryApi>("/rpc");
                  const result = await api.generateSpec(moduleId, generatePrompt, moduleData);
                  if (result._tag === "Left") {
                    setGenerateError(result.left);
                    return;
                  }
                  setGeneratedSpec(result.right);
                } catch (cause) {
                  setGenerateRequestError(cause instanceof Error ? cause.message : String(cause));
                } finally {
                  setIsGeneratingSpec(false);
                }
              })();
            }}
          >
            <label className="block font-medium" htmlFor="generate-spec-prompt">
              Prompt
            </label>
            <Input
              id="generate-spec-prompt"
              name="prompt"
              onChange={(event) => {
                setGeneratePrompt(event.target.value);
              }}
              type="text"
              value={generatePrompt}
            />
            <Button disabled={isGeneratingSpec} type="submit">
              Generate
            </Button>
          </form>
          {isGeneratingSpec ? <p role="status">Generating spec…</p> : null}
          {generateError !== undefined ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
              <p className="m-0 font-mono">{generateError.code}</p>
              <p className="mb-0 mt-2">{generateError.message}</p>
            </div>
          ) : null}
          {generateRequestError !== undefined ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
              {generateRequestError}
            </div>
          ) : null}
          {moduleId === "github-profile" ? (
            <div className="mt-8 px-4">
              <GitHubProfileJsonRenderCompare data={moduleData} spec={generatedSpec} />
            </div>
          ) : null}
        </li>
      ) : null}
      <li className="mt-10">
        <Configuration
          brickModule={brickModule}
          data={moduleData}
          setData={setModuleData}
          showData={false}
        />
      </li>
      {OptionsForm ? (
        <li className="mt-10">
          <h2 className="m-0 shrink-0 px-4 py-4 font-normal">Options</h2>
          <OptionsForm
            value={options}
            onChange={(value) => {
              setOptionsByModule((current) => ({
                ...current,
                [moduleId]: value,
              }));
            }}
          />
        </li>
      ) : null}
      <li className="mt-10">
        <h2 className="m-0 shrink-0 px-4 py-4 font-normal">Brick Definition</h2>
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
      </li>
    </>
  );
}
