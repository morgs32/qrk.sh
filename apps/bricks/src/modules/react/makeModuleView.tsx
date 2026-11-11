import { Empty } from "../../components/empty";
import type { IResult } from "@zerospin/error";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";
import { makeEffectSchema, type IInferDecodedRow, type IShape } from "@zerospin/shapes";
import { Schema } from "effect";
import { mapValues } from "es-toolkit";
import type { makeModuleVersion } from "../../definition/makeModuleVersion";
import type { IModule, IModuleBrickDef } from "./types";

function makeInitialState(state: unknown): Record<string, unknown> {
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const initialState: Record<string, unknown> = {};
    mapValues(state, (value, key) => {
      initialState[key] = value;
    });
    return initialState;
  }
  return {};
}

/** Compose shared variant sizing with JSON Render and module-owned editing UI. */
export function makeModuleView<
  MODULE extends {
    id: string;
    abbreviation: string;
    label: string;
    description: string;
    defaultSpec: Spec;
    stateShape: IShape;
    hasPlaceholder: boolean;
    variants: ReturnType<typeof makeModuleVersion>["variants"];
  },
>(
  module: MODULE,
  view: {
    defaultState: IInferDecodedRow<MODULE["stateShape"]>;
    LineIcon: ComponentType<SVGProps<SVGSVGElement>>;
    variants: {
      default: {
        placeholder?: () => ReactNode;
        preview?: (props: {
          state: IInferDecodedRow<MODULE["stateShape"]>;
          setState: (state: IInferDecodedRow<MODULE["stateShape"]>) => void;
          isActive: boolean;
          children: ReactNode;
        }) => ReactNode;
        registry: ComponentRegistry;
      };
    };
  } & (
    | {
        form?: (props: {
          state: IInferDecodedRow<MODULE["stateShape"]> | null;
          onSave: (
            state: IInferDecodedRow<MODULE["stateShape"]>,
          ) => IResult<unknown, { message: string }>;
          previewWidth?: number;
          measureFrame?: (selector: string) => number | undefined;
        }) => ReactNode;
        inlineEditor?: never;
      }
    | {
        form?: never;
        inlineEditor: (props: {
          state: IInferDecodedRow<MODULE["stateShape"]> | null;
          onSave: (
            state: IInferDecodedRow<MODULE["stateShape"]>,
          ) => IResult<unknown, { message: string }>;
          registerFlush: (flush: (onRecover?: () => void) => boolean) => () => void;
        }) => ReactNode;
      }
  ),
) {
  const { defaultSpec, ...moduleFields } = module;
  const decodeState = Schema.decodeUnknownSync(
    Schema.toType(makeEffectSchema<MODULE["stateShape"]>(module.stateShape)),
  );
  const defaultState = decodeState(view.defaultState, { onExcessProperty: "ignore" });
  const def: IModuleBrickDef<MODULE["id"]> = { moduleId: module.id, state: defaultState };
  const EditorForm = view.form;
  const Editor = view.inlineEditor;
  const variants = mapValues(view.variants, (variant, variantId) => {
    if (module.hasPlaceholder !== (variant.placeholder !== undefined)) {
      throw new Error(
        `makeModuleView: ${JSON.stringify(module.id)} placeholder must match its declaration`,
      );
    }
    const PreviewComponent = variant.preview;
    return {
      ...module.variants[variantId],
      placeholder: variant.placeholder,
      preview:
        PreviewComponent === undefined
          ? undefined
          : function Preview(props: {
              state: unknown;
              setState: (state: unknown) => void;
              isActive: boolean;
              children: ReactNode;
            }) {
              const { state, setState, isActive, children } = props;
              return (
                <PreviewComponent
                  state={decodeState(state, { onExcessProperty: "ignore" })}
                  setState={setState}
                  isActive={isActive}
                >
                  {children}
                </PreviewComponent>
              );
            },
      spec: defaultSpec,
      registry: variant.registry,
    };
  });

  function Form(props: Parameters<NonNullable<IModule<string>["Form"]>>[0]) {
    const { state, onSave, previewWidth, measureFrame } = props;
    if (EditorForm === undefined) return null;
    const decoded = state === null ? null : decodeState(state, { onExcessProperty: "ignore" });
    return (
      <EditorForm
        state={decoded}
        onSave={onSave}
        previewWidth={previewWidth}
        measureFrame={measureFrame}
      />
    );
  }

  function Render(props: Parameters<IModule<string>["Render"]>[0]) {
    const { state, variantId, spec } = props;
    const variant = variants[variantId];
    if (state === null) {
      const Placeholder = variant.placeholder;
      if (Placeholder === undefined) throw new Error(`${module.id} requires configured state`);
      return <Placeholder />;
    }
    const decoded = decodeState(state, { onExcessProperty: "ignore" });
    if ("data" in decoded && decoded.data === null)
      return (
        <Empty role="status" className="items-start gap-0 p-0 text-left">
          <p>This brick has no saved content.</p>
        </Empty>
      );
    const initialState = makeInitialState(decoded);
    return (
      <StateProvider initialState={initialState}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            <Renderer spec={spec} registry={variant.registry} />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    );
  }

  return {
    ...moduleFields,
    LineIcon: view.LineIcon,
    stateShape: module.stateShape,
    defaultState,
    def,
    variants,
    ...(EditorForm === undefined ? {} : { Form }),
    ...(Editor === undefined
      ? {}
      : {
          InlineEditor: function InlineEditor(
            props: Parameters<NonNullable<IModule<string>["InlineEditor"]>>[0],
          ) {
            const { state, onSave, registerFlush } = props;
            const decoded =
              state === null ? null : decodeState(state, { onExcessProperty: "ignore" });
            return <Editor state={decoded} onSave={onSave} registerFlush={registerFlush} />;
          },
        }),
    Render,
  };
}
