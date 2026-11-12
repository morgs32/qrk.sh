import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useTransform } from "motion/react";
import { useTickerItem } from "motion-plus/react";
import type { Spec } from "@json-render/core";
import { BrickWrapper } from "@qrk.sh/bricks/components/BrickWrapper";
import { Button } from "@qrk.sh/bricks/components/button";
import { FieldLabel } from "@qrk.sh/bricks/components/field";
import { BrickAction } from "../../../../../../../modules/components/BrickAction";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
  label?: string;
  spec?: Spec;
  sampleState?: unknown;
  onSelect?: (state: unknown) => void;
  moduleAction?: (state: unknown) => ReactNode;
}) {
  const { brickModule, breakpoint, cardStyle, label, spec, sampleState, onSelect, moduleAction } =
    props;
  const previewRef = useRef<HTMLDivElement>(null);
  const { offset, props: itemProps, cloneIndex } = useTickerItem();
  const rotateY = useTransform(offset, [-200, 0, 200], [20, 0, -20]);
  const scale = useTransform(offset, [-200, 0, 200], [0.7, 1, 0.7]);
  const x = useTransform(offset, [-800, -200, 200, 800], ["100%", "0%", "0%", "-100%"]);
  const zIndex = useTransform(offset, (value) => Math.max(0, Math.round(1000 - Math.abs(value))));
  const [{ state: previewState, revision: previewRevision }, setPreviewFrame] = useState(() => ({
    state: sampleState ?? brickModule.def.state,
    revision: 0,
  }));
  const [isVisible, setIsVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const updatePreviewState = useCallback((state: unknown) => {
    setPreviewFrame(({ revision }) => ({ state, revision: revision + 1 }));
  }, []);
  useEffect(() => {
    const element = previewRef.current;
    if (element === null) throw new Error("Missing catalog Brick preview");
    const observer = new IntersectionObserver((entries) => {
      setIsVisible(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(element);
    const onVisibilityChange = () => setDocumentVisible(document.visibilityState === "visible");
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionPreferenceChange = () => setReducedMotion(motionPreference.matches);
    onMotionPreferenceChange();
    motionPreference.addEventListener("change", onMotionPreferenceChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionPreference.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);
  const view = brickModule.variants.default;
  const { Render } = brickModule;
  const Preview = view.preview;
  const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (entry === undefined) throw new Error(`Unknown breakpoint: ${breakpoint}`);
  const previewWidth = Math.max(view.minWidth, Math.min(view.defaultWidth, entry.previewWidth));
  const renderedPreview = (
    <Render
      key={previewRevision}
      state={previewState}
      variantId="default"
      spec={spec ?? view.spec}
    />
  );

  return (
    <motion.li
      {...itemProps}
      className={`${itemProps.className} brick-catalog-preview flex min-h-0 flex-col`}
      style={{ ...itemProps.style, zIndex }}
    >
      <div className="flex flex-col items-center px-[var(--brick-catalog-inset)] pb-8 pt-[var(--brick-catalog-inset)]">
        <div
          ref={previewRef}
          data-catalog-module-id={brickModule.id}
          className="group/brick relative z-0 shrink-0"
          style={{ width: previewWidth, minWidth: view.minWidth }}
        >
          <motion.div
            className="relative shadow-[0_10px_40px_rgba(0,0,0,0.3)]"
            style={{
              transformPerspective: 500,
              x: reducedMotion ? 0 : x,
              rotateY: reducedMotion ? 0 : rotateY,
              scale: reducedMotion ? 1 : scale,
            }}
          >
            <BrickAction>{moduleAction?.(previewState)}</BrickAction>
            <div className="pointer-events-none">
              <BrickWrapper className={cardStyle ? "brick-surface-card" : undefined}>
                {Preview === undefined ? (
                  renderedPreview
                ) : (
                  <Preview
                    state={previewState}
                    setState={updatePreviewState}
                    isActive={isVisible && documentVisible && !reducedMotion}
                  >
                    {renderedPreview}
                  </Preview>
                )}
              </BrickWrapper>
            </div>
            {onSelect !== undefined ? (
              <Button
                type="button"
                variant="ghost"
                tabIndex={cloneIndex === undefined ? undefined : -1}
                aria-label={`Choose ${label ?? brickModule.label}`}
                className="absolute inset-0 z-10 h-full w-full rounded-none p-0 hover:bg-transparent"
                onClick={() => onSelect(structuredClone(previewState))}
              />
            ) : null}
          </motion.div>
        </div>
        <div className="pt-3 text-center text-zinc-950">
          <h2 className="m-0">
            <FieldLabel className="font-sans">{label ?? brickModule.label}</FieldLabel>
          </h2>
          {brickModule.maxPerPage !== undefined ? (
            <span className="text-xs text-zinc-500">Limit: {brickModule.maxPerPage} per page.</span>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}
