import type { Spec } from "@json-render/core";
import type { LibraryApi } from "@qrk.sh/api/modules/LibraryApi.public";
import { backendLibrary, type IBackendLibrary } from "@qrk.sh/zerospin/src/modules/backendLibrary";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { useId, useState, type ReactNode } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { SWRConfig } from "swr";

import { Input } from "@/components/FormInputs/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BREAKPOINTS } from "../lib/breakpoints";
import { BrickWrapper } from "../modules/components/brick/BrickWrapper";
import { Button } from "../modules/components/ui/button";
import { modulesHash } from "../modules/modulesHash";

export function BrickBreakpointPreviews<MODULE_ID extends keyof IBackendLibrary>(props: {
  moduleId: MODULE_ID;
  fixture?: "configured" | "unconfigured";
  renderSketch: (state: IInferDecodedRow<IBackendLibrary[MODULE_ID]["stateShape"]>) => ReactNode;
}) {
  const { moduleId, fixture = "configured", renderSketch } = props;
  const brick = modulesHash[moduleId];
  const { Form, Render } = brick;
  const view = brick.variants.default;
  const [moduleState, setModuleState] = useState<unknown>(() =>
    fixture === "unconfigured" ? null : structuredClone(brick.defaultState),
  );
  const [formRevision, setFormRevision] = useState(0);
  const [cardStyle, setCardStyle] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatedSpec, setGeneratedSpec] = useState<Spec>();
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<{ code?: string; message: string }>();
  const promptId = useId();
  const spec = generatedSpec ?? view.spec;

  const decodeState = Schema.decodeUnknownSync(
    Schema.toType(
      makeEffectSchema<IBackendLibrary[MODULE_ID]["stateShape"]>(
        backendLibrary[moduleId].stateShape,
      ),
    ),
  );
  const sketch =
    moduleState === null
      ? null
      : renderSketch(decodeState(moduleState, { onExcessProperty: "ignore" }));

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

  const tab =
    "h-10 flex-none gap-1.5 rounded-none border-b-2 border-transparent px-0 py-0 font-mono text-xs data-[state=active]:border-neutral-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";
  const panel = "mt-0 min-h-0 overflow-auto px-5 py-4 data-[state=inactive]:hidden";

  return (
    <SWRConfig value={{ uploadImage }}>
      <main className="qrk-bricks flex h-dvh flex-col bg-zinc-50 text-neutral-950">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <header className="flex items-center justify-between gap-4 px-5 py-4">
            <h1 className="text-base font-semibold">{brick.label} breakpoint previews</h1>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cardStyle}
                onChange={(event) => setCardStyle(event.target.checked)}
              />
              Cards
            </label>
          </header>
          {BREAKPOINTS.map((entry) => {
            const previewWidth = Math.min(view.defaultWidth, entry.previewWidth);
            const specPreview = <Render variantId="default" state={moduleState} spec={spec} />;
            return (
              <section
                key={entry.id}
                aria-label={entry.id}
                className="border-t border-neutral-200 py-4"
              >
                <h2 className="px-5 font-mono text-xs font-semibold">
                  {entry.id} · {entry.previewWidth}px
                </h2>
                <div className="overflow-x-auto px-5 pt-3 pb-2">
                  <div className="flex w-max items-start gap-4">
                    {[
                      { label: "JSX sketch", content: sketch ?? specPreview },
                      { label: "JSON Render", content: specPreview },
                    ].map(({ label, content }) => (
                      <div
                        key={label}
                        className="shrink-0"
                        style={{ width: previewWidth, minWidth: view.minWidth }}
                      >
                        <h3 className="mb-2 font-mono text-xs text-neutral-600">{label}</h3>
                        <BrickWrapper className={cardStyle ? "brick-surface-card" : undefined}>
                          {content}
                        </BrickWrapper>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        <aside
          aria-label="Brick preview drawer"
          className="flex max-h-[45dvh] min-h-0 shrink-0 flex-col border-t border-neutral-200 bg-white shadow-[0_-4px_18px_-8px_rgba(0,0,0,0.18)]"
        >
          <Tabs
            defaultValue={Form === undefined ? "generate" : "configure"}
            className="min-h-0 gap-0"
          >
            <TabsList
              aria-label="Brick preview tools"
              className="h-10 w-full shrink-0 justify-start gap-5 overflow-x-auto rounded-none border-b border-neutral-200 bg-transparent px-5 py-0"
            >
              {Form === undefined ? null : (
                <TabsTrigger value="configure" className={tab}>
                  Configure
                </TabsTrigger>
              )}
              <TabsTrigger value="generate" className={tab}>
                Generate Spec
              </TabsTrigger>
            </TabsList>
            {Form === undefined ? null : (
              <TabsContent value="configure" forceMount className={panel}>
                <Form
                  key={formRevision}
                  state={moduleState}
                  onSave={(state) => {
                    setModuleState(state);
                    return { _tag: "Success", success: undefined };
                  }}
                  onCancel={() => setFormRevision((revision) => revision + 1)}
                />
              </TabsContent>
            )}
            <TabsContent value="generate" forceMount className={panel}>
              <form
                autoComplete="off"
                className="flex max-w-3xl flex-col gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setIsGeneratingSpec(true);
                  setGenerateError(undefined);
                  try {
                    using api = newSyncRpcSession<LibraryApi>("/rpc");
                    const result = await api.generateSpec(
                      moduleId,
                      generatePrompt,
                      moduleState,
                      spec,
                    );
                    if (result._tag === "Left") setGenerateError(result.left);
                    else setGeneratedSpec(result.right);
                  } catch (cause) {
                    setGenerateError({
                      message: cause instanceof Error ? cause.message : String(cause),
                    });
                  } finally {
                    setIsGeneratingSpec(false);
                  }
                }}
              >
                <label className="text-sm font-medium" htmlFor={promptId}>
                  Prompt
                </label>
                <Input
                  id={promptId}
                  name="prompt"
                  value={generatePrompt}
                  onChange={(event) => setGeneratePrompt(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isGeneratingSpec} type="submit">
                    Generate
                  </Button>
                  <Button
                    disabled={isGeneratingSpec || generatedSpec === undefined}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setGeneratedSpec(undefined);
                      setGenerateError(undefined);
                    }}
                  >
                    Reset to default
                  </Button>
                </div>
              </form>
              {isGeneratingSpec ? <p role="status">Generating spec…</p> : null}
              {generateError === undefined ? null : (
                <div role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 p-3">
                  {generateError.code === undefined ? null : (
                    <p className="font-mono">{generateError.code}</p>
                  )}
                  <p>{generateError.message}</p>
                </div>
              )}
              {generatedSpec === undefined ? null : (
                <div className="mt-4 overflow-auto bg-white">
                  <JsonView
                    shouldExpandNode={collapseAllNested}
                    data={generatedSpec}
                    style={{ ...defaultStyles, container: "bg-white" }}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </SWRConfig>
  );
}
