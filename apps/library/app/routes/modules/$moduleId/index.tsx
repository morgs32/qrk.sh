import { useState } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import type { Spec } from "@json-render/core";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedBody } from "@qrk.sh/web/library/OrderedBody";
import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { BREAKPOINTS } from "../../../../lib/breakpoints";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { modulesHash } from "../../../../lib/modulesHash";
import type { LibraryApi } from "../../../../worker/LibraryApi.public";
import type { IScrapeError } from "../../../../worker/types.public";
import { TableData } from "../../../TableData";
import { useModuleState } from "../../../useModuleState";
import { BreakpointPreviewRow } from "./-BreakpointPreviewRow";

export const Route = createFileRoute("/modules/$moduleId/")({
  component: ModuleDetail,
});

function ModuleDetail() {
  const { moduleId } = Route.useParams();
  const brickModule = modulesHash[moduleId];

  if (!brickModule) {
    throw notFound();
  }

  const [moduleState] = useModuleState(moduleId);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatedSpec, setGeneratedSpec] = useState<Spec>();
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();
  const brick = brickModule;
  const BrickComponent = brick.component;
  const hasJsonRender = brickModule.registry !== undefined;

  return (
    <>
      <OrderedSection data-testid="module-configuration-pane" label="Module">
        <div className="mt-5">
          <TableData
            entries={[
              { label: "Module ID", value: brickModule.id },
              { label: "Module description", value: brickModule.description },
            ]}
          />
        </div>
      </OrderedSection>
      {hasJsonRender ? (
        <OrderedSection className="mt-10" label="Generative Previews">
          <OrderedBody level={2}>
            <OrderedSection label="Generate spec input">
              <form
                className="flex flex-col items-start gap-2 py-5"
                onSubmit={event => {
                  event.preventDefault();
                  void (async () => {
                    setIsGeneratingSpec(true);
                    setGenerateError(undefined);
                    setGenerateRequestError(undefined);
                    try {
                      using api = newSyncRpcSession<LibraryApi>("/rpc");
                      const result = await api.generateSpec(
                        moduleId,
                        generatePrompt,
                        moduleState,
                        generatedSpec ?? brickModule.defaultSpec,
                      );
                      if (result._tag === "Left") {
                        setGenerateError(result.left);
                        return;
                      }
                      setGeneratedSpec(result.right);
                    } catch (cause) {
                      setGenerateRequestError(
                        cause instanceof Error ? cause.message : String(cause),
                      );
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
                  onChange={event => {
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
              {generatedSpec !== undefined ? (
                <div className="mt-8 overflow-auto bg-white py-4">
                  <JsonView
                    shouldExpandNode={collapseAllNested}
                    data={generatedSpec}
                    style={{ ...defaultStyles, container: "bg-white" }}
                  />
                </div>
              ) : null}
            </OrderedSection>
            {BREAKPOINTS.map(entry => (
              <BreakpointPreviewRow
                BrickComponent={BrickComponent}
                brick={brick}
                className="mt-10"
                entry={entry}
                key={entry.id}
                moduleState={moduleState}
                moduleId={moduleId}
                spec={generatedSpec ?? brick.viewFor(entry.id).spec}
              />
            ))}
          </OrderedBody>
        </OrderedSection>
      ) : null}
      <OrderedSection className="mt-10" label="Component Previews">
        <OrderedBody level={2}>
          {BREAKPOINTS.map((entry, index) => (
            <BreakpointPreviewRow
              BrickComponent={BrickComponent}
              brick={brick}
              entry={entry}
              key={entry.id}
              moduleState={moduleState}
              moduleId={moduleId}
              spec={brick.viewFor(entry.id).spec}
              className={index === 0 ? undefined : "mt-10"}
            />
          ))}
        </OrderedBody>
      </OrderedSection>
      <OrderedSection className="mt-10" label="Brick Definition">
        <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{
              ...brick.def,
              state: moduleState,
            }}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </OrderedSection>
    </>
  );
}
