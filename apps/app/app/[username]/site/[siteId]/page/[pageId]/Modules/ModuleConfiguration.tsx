import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { BrickWrapper } from "@qrk.sh/bricks/components/BrickWrapper";
import { Button } from "@qrk.sh/bricks/components/button";
import { candidateLibraryV20 } from "@qrk.sh/bricks/modules/candidateLibrary";
import { makeEffectSchema } from "@zerospin/shapes";
import { Schema } from "effect";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { BrickAction } from "../../../../../../../modules/components/BrickAction";
import { modulesHash } from "../../../../../../../modules/modulesHash";

export function ModuleConfiguration(props: {
  moduleId: keyof typeof modulesHash;
  layoutId: string;
  initialState: unknown;
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
  onClose: () => void;
  moduleAction?: ReactNode;
}) {
  const { moduleId, layoutId, initialState, breakpoint, cardStyle, onClose, moduleAction } = props;
  const brickModule = modulesHash[moduleId];
  const candidate = candidateLibraryV20[moduleId];
  const previewRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(initialState);
  const [{ state: draft, revision }, setFrame] = useState(() => ({
    state: initialState,
    revision: 0,
  }));
  const [formReady, setFormReady] = useState(() =>
    Schema.is(candidate.completeStateSchema)(initialState),
  );
  const [dragging, setDragging] = useState(false);
  const onDraftChange = useCallback(
    (next: { state: unknown; pending: boolean; valid: boolean }) => {
      const { state, pending, valid } = next;
      setFrame((current) =>
        isEqual(current.state, state) ? current : { state, revision: current.revision + 1 },
      );
      setFormReady(!pending && valid);
    },
    [],
  );
  const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (entry === undefined) throw new Error(`Unknown breakpoint: ${breakpoint}`);
  const view = brickModule.variants.default;
  const previewWidth = Math.max(view.minWidth, Math.min(view.defaultWidth, entry.previewWidth));
  const spec = candidate.layouts[layoutId];
  if (spec === undefined) throw new Error(`Unknown ${moduleId} layout: ${layoutId}`);
  const ready = formReady && Schema.is(candidate.completeStateSchema)(draft);

  useEffect(() => {
    const element = previewRef.current;
    if (element === null || !ready) return;
    return draggable({
      element,
      getInitialData: () => {
        setDragging(true);
        return {
          type: "catalog-brick",
          moduleId,
          layoutId,
          state: structuredClone(draft),
          onPlaced: onClose,
        };
      },
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: pointerOutsideOfPreview({ x: "16px", y: "8px" }),
          render: ({ container }) => {
            const appearance = getComputedStyle(element);
            container.classList.add("brick-drag-preview");
            container.classList.toggle("dark", element.closest(".dark") !== null);
            container.style.font = appearance.font;
            container.style.color = appearance.color;
            container.style.width = `${element.getBoundingClientRect().width}px`;
            container.append(element.cloneNode(true));
          },
        });
      },
      onDrop: () => setDragging(false),
    });
  }, [draft, layoutId, moduleId, onClose, ready]);

  const validRenderState =
    draft !== null && Schema.is(Schema.toType(makeEffectSchema(brickModule.stateShape)))(draft);
  const renderState = validRenderState ? draft : brickModule.hasPlaceholder ? null : initialState;
  const Form = brickModule.Form;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Back
        </Button>
        <h2 className="m-0 text-sm font-medium">Configure {brickModule.label}</h2>
      </div>
      <div className="overflow-x-auto px-[var(--brick-catalog-inset)] py-[var(--brick-catalog-inset)]">
        <div
          ref={previewRef}
          data-catalog-module-id={moduleId}
          aria-disabled={!ready}
          className={`group/brick relative shrink-0 ${ready ? "cursor-grab" : "cursor-not-allowed"} ${dragging ? "opacity-40" : ""}`}
          style={{ width: previewWidth, minWidth: view.minWidth }}
        >
          <BrickAction>{moduleAction}</BrickAction>
          <div className="pointer-events-none">
            <BrickWrapper className={cardStyle ? "brick-surface-card" : undefined}>
              <brickModule.Render
                key={revision}
                state={renderState}
                variantId="default"
                spec={spec}
              />
            </BrickWrapper>
          </div>
        </div>
      </div>
      <p className="px-3 text-xs text-zinc-500" role="status">
        {ready ? "Drag this Brick onto your page." : "Complete the configuration before dragging."}
      </p>
      {Form !== undefined ? (
        <div className="grid gap-3 px-3 py-3">
          <Form
            state={state}
            previewWidth={entry.previewWidth}
            measureFrame={(selector) => {
              const frame = previewRef.current?.querySelector(selector);
              if (frame === undefined || frame === null) return;
              const { width, height } = frame.getBoundingClientRect();
              return width > 0 && height > 0 ? width / height : undefined;
            }}
            onSave={(state) => {
              setState(state);
              setFrame((current) =>
                isEqual(current.state, state) ? current : { state, revision: current.revision + 1 },
              );
              return { _tag: "Success", success: undefined };
            }}
            onDraftChange={onDraftChange}
          />
        </div>
      ) : null}
    </div>
  );
}
