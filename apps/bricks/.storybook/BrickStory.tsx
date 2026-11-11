import type { Spec } from "@json-render/core";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { makeEffectSchema, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { Schema } from "effect";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import { SWRConfig } from "swr";

import { BrickWrapper } from "../src/react/BrickWrapper";
import { Input } from "../src/react/Input";
import { Button } from "../src/react/button";
import { StudioSidebar } from "../src/react/StudioSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../src/react/tabs";
import type { IModule } from "../src/react/types";
import type { LibraryApi } from "../src/rpc/LibraryApi";

const BREAKPOINTS = [
  { id: "sm", previewWidth: 360 },
  { id: "md", previewWidth: 720 },
  { id: "lg", previewWidth: 1080 },
  { id: "xl", previewWidth: 1440 },
];

const panelClassName = "mt-0 data-[state=inactive]:hidden";

export function BrickStory<STATE_SHAPE extends IShape>(props: {
  definition: { id: string; stateShape: STATE_SHAPE };
  view: IModule<string>;
  fixture?: "configured" | "unconfigured";
  renderSketch: (state: IInferDecodedRow<STATE_SHAPE>) => ReactNode;
}) {
  const { definition, view, fixture = "configured", renderSketch } = props;
  const { Form, Render } = view;
  const variant = view.variants.default;
  const [moduleState, setModuleState] = useState<unknown>(() =>
    fixture === "unconfigured" ? null : structuredClone(view.defaultState),
  );
  const [formRevision, setFormRevision] = useState(0);
  const [cardStyle, setCardStyle] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generatedSpec, setGeneratedSpec] = useState<Spec>();
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [generateError, setGenerateError] = useState<{ code?: string; message: string }>();
  const activeGeneration = useRef<AbortController | null>(null);
  const promptId = useId();
  const preview = useRef<HTMLElement>(null);
  const spec = generatedSpec ?? variant.spec;
  useEffect(() => () => activeGeneration.current?.abort(), []);

  const decodeState = Schema.decodeUnknownSync(
    Schema.toType(makeEffectSchema<STATE_SHAPE>(definition.stateShape)),
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

  return (
    <SWRConfig value={(config) => ({ ...config, uploadImage })}>
      <div className="qrk-bricks flex h-dvh bg-zinc-50 text-neutral-950">
        <main ref={preview} className="min-w-0 flex-1 overflow-y-auto">
          <header className="flex items-center justify-between gap-4 px-5 py-4">
            <h1 className="text-base font-semibold">{view.label} breakpoint previews</h1>
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
            const previewWidth = Math.min(variant.defaultWidth, entry.previewWidth);
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
                        style={{ width: previewWidth, minWidth: variant.minWidth }}
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
        </main>
        <Tabs defaultValue={Form === undefined ? "generate" : "configure"} className="contents">
          <StudioSidebar
            label="Brick preview tools"
            header={
              <TabsList aria-label="Preview tools" variant="line">
                {Form === undefined ? null : <TabsTrigger value="configure">Configure</TabsTrigger>}
                <TabsTrigger value="generate">Generate Spec</TabsTrigger>
              </TabsList>
            }
          >
            {Form === undefined ? null : (
              <TabsContent value="configure" forceMount className={panelClassName}>
                <Form
                  key={formRevision}
                  state={moduleState}
                  previewWidth={BREAKPOINTS[0].previewWidth}
                  measureFrame={(selector) => {
                    const frame = preview.current?.querySelector(selector);
                    if (frame === undefined || frame === null) return;
                    const { width, height } = frame.getBoundingClientRect();
                    return width > 0 && height > 0 ? width / height : undefined;
                  }}
                  onSave={(state) => {
                    setModuleState(state);
                    return { _tag: "Success", success: undefined };
                  }}
                  onCancel={() => setFormRevision((revision) => revision + 1)}
                />
              </TabsContent>
            )}
            <TabsContent value="generate" forceMount className={panelClassName}>
              <form
                autoComplete="off"
                className="flex max-w-3xl flex-col gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (activeGeneration.current !== null) return;
                  const request = new AbortController();
                  activeGeneration.current = request;
                  setIsGeneratingSpec(true);
                  setGenerateError(undefined);
                  try {
                    using api = newSyncRpcSession<LibraryApi>("/rpc");
                    const close = () => api[Symbol.dispose]();
                    request.signal.addEventListener("abort", close, { once: true });
                    try {
                      const result = await api.generateSpec(
                        definition.id,
                        generatePrompt,
                        moduleState,
                        spec,
                      );
                      if (request.signal.aborted) return;
                      if (result._tag === "Left") setGenerateError(result.left);
                      else setGeneratedSpec(result.right);
                    } finally {
                      request.signal.removeEventListener("abort", close);
                    }
                  } catch (cause) {
                    if (!request.signal.aborted) {
                      setGenerateError({
                        message: cause instanceof Error ? cause.message : String(cause),
                      });
                    }
                  } finally {
                    if (activeGeneration.current === request) {
                      activeGeneration.current = null;
                      setIsGeneratingSpec(false);
                    }
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
                  {isGeneratingSpec ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const request = activeGeneration.current;
                        activeGeneration.current = null;
                        request?.abort();
                        setIsGeneratingSpec(false);
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
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
          </StudioSidebar>
        </Tabs>
      </div>
    </SWRConfig>
  );
}
