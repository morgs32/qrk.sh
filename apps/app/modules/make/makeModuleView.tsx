import type { IResult } from "@zerospin/error";
import type { ComponentType, ReactNode, SVGProps } from "react";

import type { Catalog, Spec } from "@json-render/core";
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
    catalog?: Catalog;
    stateShape: IShape;
    defaultState: unknown;
    hasPlaceholder: boolean;
    variants: ReturnType<typeof makeModuleVersion>["variants"];
    def: {
      moduleId: string;
      state: unknown;
    };
  },
>(
  module: MODULE,
  view: {
    LineIcon: ComponentType<SVGProps<SVGSVGElement>>;
    form?: (props: {
      state: IInferDecodedRow<MODULE["stateShape"]> | null;
      onSave: (
        state: IInferDecodedRow<MODULE["stateShape"]>,
      ) => IResult<unknown, { message: string }>;
      onCancel: () => void;
    }) => ReactNode;
    variants: {
      default: {
        component: (props: { state: IInferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
        placeholder: () => ReactNode;
        generator?: {
          registry: ComponentRegistry;
          defaultSpec: Spec;
        };
      };
    };
  },
) {
  const { defaultSpec, ...moduleFields } = module;
  if (!module.hasPlaceholder) {
    throw new Error(`makeModuleView: ${JSON.stringify(module.id)} must declare hasPlaceholder`);
  }
  const decodeState = Schema.decodeUnknownSync(
    Schema.toType(makeEffectSchema<MODULE["stateShape"]>(module.stateShape)),
  );
  const decodeFormState = Schema.decodeUnknownSync(
    Schema.toType(makeEffectSchema<MODULE["stateShape"]>(module.stateShape)),
  );
  const variants = mapValues(view.variants, (variant, variantId) => {
    if (variant.generator !== undefined && module.catalog === undefined) {
      throw new Error(
        `makeModuleView: ${JSON.stringify(module.id)} has no catalog; omit generator`,
      );
    }
    const Component = variant.component;
    function Authored(props: { state: unknown }) {
      const { state } = props;
      const Placeholder = variant.placeholder;
      if (state === null) return <Placeholder />;
      const decoded = decodeState(state, { onExcessProperty: "ignore" });
      return <Component state={decoded} />;
    }
    return {
      ...module.variants[variantId],
      component: Authored,
      placeholder: variant.placeholder,
      spec: variant.generator?.defaultSpec ?? defaultSpec,
      registry: variant.generator?.registry,
    };
  });

  function Form(props: {
    state: unknown;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onCancel: () => void;
  }) {
    const { state, onSave, onCancel } = props;
    if (view.form === undefined) return null;
    const decoded = state === null ? null : decodeFormState(state, { onExcessProperty: "ignore" });
    return view.form({ state: decoded, onSave, onCancel });
  }

  function Brick(props: { state?: unknown; variantId: "default"; spec: Spec }) {
    const { state, variantId, spec } = props;
    const variant = variants[variantId];
    const Placeholder = variant.placeholder;
    if (state === null) {
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
    defaultState: module.defaultState,
    variants,
    ...(view.form === undefined ? {} : { Form }),
    component: Brick,
  };
}
