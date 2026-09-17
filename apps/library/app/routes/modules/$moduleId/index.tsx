import { useCallback, useState } from "react";
import type { ReactNode, RefCallback } from "react";

import { createFileRoute, notFound } from "@tanstack/react-router";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import type { Spec } from "@json-render/core";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import { OrderedSection } from "@qrk.sh/web/library/OrderedDoc";

import { BrickPreview } from "../../../../lib/BrickPreview";
import { BREAKPOINTS } from "../../../../lib/breakpoints";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { modulesHash } from "../../../../lib/modulesHash";
import type { LibraryApi } from "../../../../worker/LibraryApi.public";
import type { IScrapeError } from "../../../../worker/types.public";
import { TableData } from "../../../TableData";
import { Configuration } from "../../../Configuration";
import { useBricksStore } from "../../../../lib/BrickStoreProvider";
import { useModuleData } from "../../../useModuleData";

export const Route = createFileRoute("/modules/$moduleId/")({
  component: ModuleDetail,
});

const nestedListClassName =
  "mt-10 list-outside marker:font-mono marker:text-neutral-400 pl-[29px] max-[480px]:pl-8 list-[lower-alpha]";

/** Smallest integer grid units whose pixel size is ≥ intrinsicPx. */
function minGridUnits(gridItemWidth: number, intrinsicPx: number): number {
  if (intrinsicPx <= 0) return 1;
  return Math.max(1, Math.ceil(intrinsicPx / gridItemWidth));
}

function UnconstrainedBrickPreview({
  children,
  onSizeChange,
}: {
  children: ReactNode;
  /** When omitted, only the local px label updates — nothing drives gridItem sizing. */
  onSizeChange?: (size: { widthPx: number; heightPx: number }) => void;
}) {
  const [sizeLabel, setSizeLabel] = useState<string>();
  const rootRef = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      if (!element) return;

      const updateSize = () => {
        const bounds = element.getBoundingClientRect();
        const widthPx = Math.round(bounds.width);
        const heightPx = Math.round(bounds.height);
        setSizeLabel(`${widthPx}×${heightPx}px`);
        onSizeChange?.({ widthPx, heightPx });
      };

      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [onSizeChange],
  );

  return (
    <div>
      <div
        ref={rootRef}
        className="qrk-bricks shadow-[0_8px_28px_rgb(0_0_0/0.06),0_1px_6px_rgb(0_0_0/0.04)]"
        style={{ float: "left", width: "max-content" }}
      >
        {children}
      </div>
      {sizeLabel !== undefined ? (
        <p className="m-0 clear-both pt-2 font-mono text-neutral-500">{sizeLabel}</p>
      ) : null}
    </div>
  );
}

function BreakpointPreviewRow({
  entry,
  moduleId,
  brick,
  moduleData,
  breakpointOptions,
  BrickComponent,
  className,
  spec,
  attachSpecOnDrag = false,
}: {
  entry: (typeof BREAKPOINTS)[number];
  moduleId: string;
  brick: NonNullable<(typeof modulesHash)[string]>;
  moduleData: unknown;
  breakpointOptions: unknown;
  BrickComponent: NonNullable<(typeof modulesHash)[string]>["component"];
  className?: string;
  spec?: Spec;
  attachSpecOnDrag?: boolean;
}) {
  const setActiveBrickDrag = useBricksStore((state) => state.setActiveBrickDrag);
  const [intrinsicSize, setIntrinsicSize] = useState<{ widthPx: number; heightPx: number }>();
  const onSizeChange = useCallback((size: { widthPx: number; heightPx: number }) => {
    setIntrinsicSize((current) => {
      if (current?.widthPx === size.widthPx && current?.heightPx === size.heightPx) {
        return current;
      }
      return size;
    });
  }, []);

  if (attachSpecOnDrag && spec === undefined) {
    return null;
  }

  const declared = brick.def[entry.id];
  const measurable = brick.breakpoints[entry.id].measurable;
  let w: number;
  let h: number;
  if (measurable) {
    w = intrinsicSize ? minGridUnits(entry.gridItemWidth, intrinsicSize.widthPx) : 1;
    h = intrinsicSize ? minGridUnits(entry.gridItemWidth, intrinsicSize.heightPx) : 1;
  } else {
    w = declared.w;
    h = declared.h;
  }

  return (
    <OrderedSection className={className} headingClassName="shrink-0 py-2" label={entry.id}>
      <div className="overflow-x-auto px-4 py-8">
        <div className="flex w-max items-start gap-4">
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">gridItem</p>
            <BrickPreview breakpoint={entry.id} w={w} h={h}>
              <div
                className="size-full qrk-bricks brick-drag-surface overflow-hidden"
                data-module-brick={moduleId}
                data-testid="brick-preview"
                draggable
                onDragStart={(event) => {
                  setActiveBrickDrag({
                    ...brick.def,
                    data: structuredClone(moduleData),
                    ...(breakpointOptions !== undefined
                      ? { breakpointOptions: structuredClone(breakpointOptions) }
                      : {}),
                    ...(attachSpecOnDrag && spec !== undefined
                      ? { spec: structuredClone(spec) }
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
                    breakpointOptions={breakpointOptions}
                    spec={spec}
                  />
                </div>
              </div>
            </BrickPreview>
            {!measurable || intrinsicSize !== undefined ? (
              <p className="m-0 pt-2 font-mono text-neutral-500">
                w={w} h={h}
              </p>
            ) : null}
          </div>
          <div>
            <p className="m-0 mb-2 font-mono text-neutral-500">intrinsic</p>
            <UnconstrainedBrickPreview onSizeChange={measurable ? onSizeChange : undefined}>
              <BrickComponent
                breakpoint={entry.id}
                data={moduleData}
                breakpointOptions={breakpointOptions}
                spec={spec}
              />
            </UnconstrainedBrickPreview>
          </div>
        </div>
      </div>
    </OrderedSection>
  );
}

function ModuleDetail() {
  const [breakpointOptionsByModule, setBreakpointOptionsByModule] = useState<
    Record<string, Partial<Record<"sm" | "md" | "lg" | "xl", unknown>>>
  >({});
  const { moduleId } = Route.useParams();
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
  function canonicalOptionsBreakpoint(breakpoint: "sm" | "md" | "lg" | "xl") {
    const options = brick.breakpoints[breakpoint].options;
    if (options === undefined) return undefined;
    if (brick.breakpoints.sm.options === options) return "sm";
    if (brick.breakpoints.md.options === options) return "md";
    if (brick.breakpoints.lg.options === options) return "lg";
    return "xl";
  }
  function optionsValue(breakpoint: "sm" | "md" | "lg" | "xl") {
    const canonical = canonicalOptionsBreakpoint(breakpoint);
    if (canonical === undefined) return undefined;
    const config = brick.breakpoints[canonical].options;
    return breakpointOptionsByModule[moduleId]?.[canonical] ?? config?.defaultValue;
  }
  const hasJsonRender = brickModule.catalog !== undefined && brickModule.registry !== undefined;

  return (
    <>
      <OrderedSection
        data-testid="module-configuration-pane"
        headingClassName="shrink-0"
        label="Module"
      >
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
        <OrderedSection className="mt-10" headingClassName="shrink-0" label="Generative Previews">
          <ol className={nestedListClassName}>
            <OrderedSection headingClassName="shrink-0 py-4" label="Generate spec input">
              <form
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
                        moduleData,
                        generatedSpec ?? brickModule.breakpoints.sm.defaultSpec ?? null,
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
            {BREAKPOINTS.map((entry) => (
              <BreakpointPreviewRow
                BrickComponent={BrickComponent}
                attachSpecOnDrag
                brick={brick}
                className="mt-10"
                entry={entry}
                key={entry.id}
                moduleData={moduleData}
                moduleId={moduleId}
                breakpointOptions={optionsValue(entry.id)}
                spec={generatedSpec ?? brick.breakpoints[entry.id].defaultSpec}
              />
            ))}
          </ol>
        </OrderedSection>
      ) : null}
      <OrderedSection className="mt-10" headingClassName="shrink-0" label="Component Previews">
        <ol className={nestedListClassName}>
          {BREAKPOINTS.map((entry, index) => (
            <BreakpointPreviewRow
              BrickComponent={BrickComponent}
              brick={brick}
              entry={entry}
              key={entry.id}
              moduleData={moduleData}
              moduleId={moduleId}
              breakpointOptions={optionsValue(entry.id)}
              className={index === 0 ? undefined : "mt-10"}
            />
          ))}
        </ol>
      </OrderedSection>
      {brickModule.data !== null && brickModule.data.dataType !== "static" ? (
        <OrderedSection className="mt-10" headingClassName="shrink-0 py-4" label="Configuration">
          <Configuration
            brickModule={brickModule}
            data={moduleData}
            setData={setModuleData}
            showData={false}
          />
        </OrderedSection>
      ) : null}
      {(["sm", "md", "lg", "xl"] as const).map((breakpoint) => {
        if (canonicalOptionsBreakpoint(breakpoint) !== breakpoint) return null;
        const options = brick.breakpoints[breakpoint].options;
        const BreakpointOptionsForm = options?.form;
        if (BreakpointOptionsForm === undefined) return null;
        return (
          <OrderedSection
            className="mt-10"
            headingClassName="shrink-0 py-4"
            key={breakpoint}
            label={breakpoint === "sm" ? "Options" : `Options (${breakpoint})`}
          >
            <BreakpointOptionsForm
              value={optionsValue(breakpoint)}
              onChange={(value) => {
                setBreakpointOptionsByModule((current) => ({
                  ...current,
                  [moduleId]: {
                    ...current[moduleId],
                    [breakpoint]: value,
                  },
                }));
              }}
            />
          </OrderedSection>
        );
      })}
      <OrderedSection className="mt-10" headingClassName="shrink-0 py-4" label="Brick Definition">
        <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{
              ...brick.def,
              data: moduleData,
              ...(optionsValue("sm") !== undefined
                ? { breakpointOptions: optionsValue("sm") }
                : {}),
            }}
            style={{ ...defaultStyles, container: "bg-white" }}
          />
        </div>
      </OrderedSection>
    </>
  );
}
