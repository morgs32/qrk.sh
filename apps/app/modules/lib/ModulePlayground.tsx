import type { Spec } from "@json-render/core";
import { OrderedBody } from "@qrk.sh/web/library/OrderedBody";
import { OrderedDoc, OrderedSection } from "@qrk.sh/web/library/OrderedDoc";
import { OrderedOutline } from "@qrk.sh/web/library/OrderedOutline";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import { useId, useMemo, useState } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { SWRConfig } from "swr";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import type { IScrapeError } from "@qrk.sh/api/modules/types";
import { BreakpointPreviewRow } from "./BreakpointPreviewRow";
import { BrickCardStyleContext } from "./BrickCardStyleContext";
import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";

/** A module's example edits and generated specs live only in this mounted story. */
export function ModulePlayground(props: {
  moduleId: keyof typeof modulesHash;
  fixture?: "configured" | "unconfigured";
}) {
  const { moduleId, fixture = "configured" } = props;
  const brick = modulesHash[moduleId];
  const [moduleState, setModuleState] = useState<unknown>(() => {
    if (fixture === "unconfigured") return null;
    return structuredClone(brick.defaultState);
  });
  const [formRevision, setFormRevision] = useState(0);
  const [cardStyle, setCardStyle] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatedSpec, setGeneratedSpec] = useState<Spec>();
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<IScrapeError>();
  const [generateRequestError, setGenerateRequestError] = useState<string>();
  const promptId = useId();
  const Form = brick.Form;
  const specs = useMemo(
    () => ({
      sm: generatedSpec ?? brick.variants.default.spec,
      md: generatedSpec ?? brick.variants.default.spec,
      lg: generatedSpec ?? brick.variants.default.spec,
      xl: generatedSpec ?? brick.variants.default.spec,
    }),
    [brick, generatedSpec],
  );
  async function uploadImage(file: File, options: { signal: AbortSignal }): Promise<string> {
    const { signal } = options;
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/image/upload", {
      method: "POST",
      body,
      signal,
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const error = Schema.decodeUnknownSync(
        Schema.Struct({ code: Schema.String, message: Schema.String }),
      )(result);
      throw new Error(error.message);
    }
    const uploaded = Schema.decodeUnknownSync(
      Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
    )(result);
    return uploaded.url;
  }

  return (
    <SWRConfig value={{ uploadImage }}>
      <BrickCardStyleContext value={cardStyle}>
        <main className="qrk-bricks min-h-screen bg-zinc-50">
          <OrderedDoc>
            <div className="flex flex-col gap-8 px-6 lg:flex-row lg:gap-10 lg:px-8">
              <aside className="hidden shrink-0 self-start pt-6 lg:sticky lg:top-0 lg:block lg:pt-8">
                <OrderedOutline />
              </aside>
              <div className="min-w-0 flex-1 py-6 lg:py-8">
                <OrderedBody showAnchors>
                  <OrderedSection label="Module">
                    <div className="mt-5 space-y-4">
                      <table className="w-full max-w-[500px] border-collapse border border-zinc-200 font-mono">
                        <tbody>
                          <tr className="border-b border-zinc-200">
                            <th
                              scope="row"
                              className="border-r border-zinc-200 p-2 text-left font-normal"
                            >
                              Module ID
                            </th>
                            <td className="p-2">{brick.id}</td>
                          </tr>
                          <tr>
                            <th
                              scope="row"
                              className="border-r border-zinc-200 p-2 text-left align-top font-normal"
                            >
                              Module description
                            </th>
                            <td className="p-2">{brick.description}</td>
                          </tr>
                        </tbody>
                      </table>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={cardStyle}
                          onChange={(event) => setCardStyle(event.target.checked)}
                        />
                        Cards
                      </label>
                      {Form !== undefined ? (
                        <details>
                          <summary className="cursor-pointer">Configure example</summary>
                          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
                            <Form
                              key={formRevision}
                              state={moduleState}
                              onSave={(state) => {
                                setModuleState(state);
                                return { _tag: "Success", success: undefined };
                              }}
                              onCancel={() => setFormRevision((revision) => revision + 1)}
                            />
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </OrderedSection>
                  {brick.variants.default.registry !== undefined ? (
                    <OrderedSection className="mt-10" label="Generate spec">
                      <OrderedBody level={2}>
                        <OrderedSection label="Generate spec input">
                          <form
                            autoComplete="off"
                            className="flex flex-col items-start gap-2 py-5"
                            onSubmit={(event) => {
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
                                    generatedSpec ?? brick.variants.default.spec,
                                  );
                                  if (result._tag === "Left") setGenerateError(result.left);
                                  else setGeneratedSpec(result.right);
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
                            <label className="block font-medium" htmlFor={promptId}>
                              Prompt
                            </label>
                            <Input
                              id={promptId}
                              name="prompt"
                              value={generatePrompt}
                              onChange={(event) => setGeneratePrompt(event.target.value)}
                            />
                            <Button disabled={isGeneratingSpec} type="submit">
                              Generate
                            </Button>
                          </form>
                          {isGeneratingSpec ? <p role="status">Generating spec…</p> : null}
                          {generateError !== undefined ? (
                            <div
                              className="rounded-md border border-red-200 bg-red-50 p-4"
                              role="alert"
                            >
                              <p className="m-0 font-mono">{generateError.code}</p>
                              <p className="mb-0 mt-2">{generateError.message}</p>
                            </div>
                          ) : null}
                          {generateRequestError !== undefined ? (
                            <p role="alert">{generateRequestError}</p>
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
                      </OrderedBody>
                    </OrderedSection>
                  ) : null}
                  <OrderedSection className="mt-10" label="Previews">
                    <OrderedBody level={2}>
                      {BREAKPOINTS.map((entry, index) => (
                        <BreakpointPreviewRow
                          key={entry.id}
                          brick={brick}
                          entry={entry}
                          moduleState={moduleState}
                          moduleId={moduleId}
                          specs={specs}
                          className={index === 0 ? undefined : "mt-10"}
                        />
                      ))}
                    </OrderedBody>
                  </OrderedSection>
                  <OrderedSection className="mt-10" label="Brick Definition">
                    <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
                      <JsonView
                        shouldExpandNode={collapseAllNested}
                        data={{ ...brick.def, state: moduleState }}
                        style={{ ...defaultStyles, container: "bg-white" }}
                      />
                    </div>
                  </OrderedSection>
                </OrderedBody>
              </div>
            </div>
          </OrderedDoc>
        </main>
      </BrickCardStyleContext>
    </SWRConfig>
  );
}
