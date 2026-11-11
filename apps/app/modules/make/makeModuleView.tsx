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
import type { makeModuleVersion } from "@qrk.sh/zerospin/src/modules/make/makeModuleVersion";
import type { IModule, IModuleBrickDef } from "../lib/types";

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

/** Compose shared variant sizing with React rendering, placeholders, and optional generators. */
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
        component: (props: { state: IInferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
        placeholder?: () => ReactNode;
        preview?: (props: {
          state: IInferDecodedRow<MODULE["stateShape"]>;
          setState: (state: IInferDecodedRow<MODULE["stateShape"]>) => void;
          isActive: boolean;
        }) => ReactNode;
        generator?: {
          registry: ComponentRegistry;
          defaultSpec: Spec;
        };
      };
    };
  } & (
    | {
        form?: (props: {
          state: IInferDecodedRow<MODULE["stateShape"]> | null;
          onSave: (
            state: IInferDecodedRow<MODULE["stateShape"]>,
          ) => IResult<unknown, { message: string }>;
          onCancel: () => void;
          renderActions: (actions: ReactNode) => ReactNode;
        }) => ReactNode;
        inlineEditor?: never;
      }
    | {
        form?: never;
        inlineEditor: (props: {
          state: IInferDecodedRow<MODULE["stateShape"]> | null;
          onFocus: () => void;
          renderDrawer: (content: ReactNode) => ReactNode;
          onSave: (
            state: IInferDecodedRow<MODULE["stateShape"]>,
          ) => IResult<unknown, { message: string }>;
          registerFlush: (flush: () => boolean) => () => void;
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
  const InlineEditor = view.inlineEditor;
  const variants = mapValues(view.variants, (variant, variantId) => {
    if (module.hasPlaceholder !== (variant.placeholder !== undefined)) {
      throw new Error(
        `makeModuleView: ${JSON.stringify(module.id)} placeholder must match its declaration`,
      );
    }
    const Component = variant.component;
    const PreviewComponent = variant.preview;
    function Authored(props: { state: unknown }) {
      const { state } = props;
      const Placeholder = variant.placeholder;
      if (state === null) {
        if (Placeholder === undefined) throw new Error(`${module.id} requires configured state`);
        return <Placeholder />;
      }
      const decoded = decodeState(state, { onExcessProperty: "ignore" });
      return <Component state={decoded} />;
    }
    return {
      ...module.variants[variantId],
      component: Authored,
      placeholder: variant.placeholder,
      preview:
        PreviewComponent === undefined
          ? undefined
          : function Preview(props: {
              state: unknown;
              setState: (state: unknown) => void;
              isActive: boolean;
            }) {
              const { state, setState, isActive } = props;
              return (
                <PreviewComponent
                  state={decodeState(state, { onExcessProperty: "ignore" })}
                  setState={setState}
                  isActive={isActive}
                />
              );
            },
      spec: variant.generator?.defaultSpec ?? defaultSpec,
      registry: variant.generator?.registry,
    };
  });

  function Form(props: {
    state: unknown;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onCancel: () => void;
    renderActions: (actions: ReactNode) => ReactNode;
  }) {
    const { state, onSave, onCancel, renderActions } = props;
    if (EditorForm === undefined) return null;
    const decoded = state === null ? null : decodeState(state, { onExcessProperty: "ignore" });
    return (
      <EditorForm
        state={decoded}
        onSave={onSave}
        onCancel={onCancel}
        renderActions={renderActions}
      />
    );
  }

  function Brick(props: Parameters<IModule<string>["component"]>[0]) {
    const { state, variantId, spec, ...surface } = props;
    if (surface.mode === "studio" && InlineEditor !== undefined) {
      const { onFocus, renderDrawer, onSave, registerFlush } = surface;
      const decoded = state === null ? null : decodeState(state, { onExcessProperty: "ignore" });
      return (
        <InlineEditor
          state={decoded}
          onFocus={onFocus}
          renderDrawer={renderDrawer}
          onSave={onSave}
          registerFlush={registerFlush}
        />
      );
    }
    const variant = variants[variantId];
    const Placeholder = variant.placeholder;
    if (state === null) {
      if (Placeholder === undefined) throw new Error(`${module.id} requires configured state`);
      return <Placeholder />;
    }
    const Authored = variant.component;
    const decoded = decodeState(state, { onExcessProperty: "ignore" });
    // An empty content snapshot belongs to the module's authored rendering.
    if (variant.registry === undefined || ("data" in decoded && decoded.data === null)) {
      return <Authored state={decoded} />;
    }
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
    hasInlineEditor: InlineEditor !== undefined,
    component: Brick,
  };
}
