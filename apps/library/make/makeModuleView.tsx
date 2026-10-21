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

const emptySpec: Spec = {
  root: "empty",
  elements: {},
};

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

function resolvedGenerator(
  moduleId: string,
  slot: string,
  catalog: Catalog | undefined,
  base:
    | {
        registry: ComponentRegistry;
        defaultSpec: Spec;
      }
    | undefined,
  overlay:
    | {
        registry?: ComponentRegistry;
        defaultSpec?: Spec;
      }
    | undefined,
) {
  if (overlay === undefined) {
    return base;
  }
  const registry = overlay.registry ?? base?.registry;
  const defaultSpec = overlay.defaultSpec ?? base?.defaultSpec;
  if (registry === undefined || defaultSpec === undefined) {
    throw new Error(
      `makeModuleView: ${JSON.stringify(moduleId)} ${slot} generator needs registry and defaultSpec`,
    );
  }
  if (catalog === undefined) {
    throw new Error(`makeModuleView: ${JSON.stringify(moduleId)} has no catalog; omit generator`);
  }
  return { registry, defaultSpec };
}

/** View factory: authored component and placeholder, optional generator and breakpoint overlays. */
export function makeModuleView<
  MODULE extends {
    id: string;
    abbreviation: string;
    label: string;
    description: string;
    catalog?: Catalog;
    stateShape: IShape;
    defaultState: unknown;
    hasPlaceholder: boolean;
    def: {
      moduleId: string;
      state: unknown;
    };
  },
>(
  module: MODULE,
  view: {
    LineIcon: ComponentType<SVGProps<SVGSVGElement>>;
    configureCommand?:
      | "configureInstagram"
      | "configureGithubActivity"
      | "configureGithubProfile"
      | "configureGithubRepo"
      | "configureFigmaThumbnail"
      | "configureLink"
      | "configureMapPlace";
    form?: (props: {
      state: IInferDecodedRow<MODULE["stateShape"]> | null;
      onConfigure: (input: unknown) => IResult<unknown, { message: string }>;
      onSave: (
        state: IInferDecodedRow<MODULE["stateShape"]>,
      ) => IResult<unknown, { message: string }>;
      onCancel: () => void;
    }) => ReactNode;
    default: {
      /** Preferred preview width in pixels, capped by the selected breakpoint's width. */
      defaultWidth: number;
      /** Minimum rendered width in pixels, shared by every breakpoint. */
      minWidth: 160 | 320;
      component: (props: { state: IInferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
      placeholder: () => ReactNode;
      generator?: {
        registry: ComponentRegistry;
        defaultSpec: Spec;
      };
    };
  } & {
    [K in "sm" | "md" | "lg" | "xl"]?: {
      defaultWidth?: number;
      component?: (props: { state: IInferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
      generator?: {
        registry?: ComponentRegistry;
        defaultSpec?: Spec;
      };
    };
  },
) {
  if (!module.hasPlaceholder) {
    throw new Error(
      `makeModuleView: ${JSON.stringify(module.id)} must declare hasPlaceholder`,
    );
  }
  if (view.default.generator !== undefined && module.catalog === undefined) {
    throw new Error(`makeModuleView: ${JSON.stringify(module.id)} has no catalog; omit generator`);
  }
  const decodeState = Schema.decodeUnknownSync(
    Schema.toType(makeEffectSchema<MODULE["stateShape"]>(module.stateShape)),
  );
  const decodeFormState = Schema.decodeUnknownSync(
    Schema.toType(makeEffectSchema<MODULE["stateShape"]>(module.stateShape)),
  );
  const authoredByComponent = new Map<
    typeof view.default.component,
    (props: { state: unknown }) => ReactNode
  >();
  const authoredComponents = mapValues(
    { sm: view.sm, md: view.md, lg: view.lg, xl: view.xl },
    (overlay) => {
      const Component = overlay?.component ?? view.default.component;
      const existing = authoredByComponent.get(Component);
      if (existing !== undefined) {
        return existing;
      }
      function Authored(props: { state: unknown }) {
        const { state } = props;
        const Placeholder = view.default.placeholder;
        if (state === null) return <Placeholder />;
        const decoded = decodeState(state, { onExcessProperty: "ignore" });
        return <Component state={decoded} />;
      }
      authoredByComponent.set(Component, Authored);
      return Authored;
    },
  );

  function Form(props: {
    state: unknown;
    onConfigure: (input: unknown) => IResult<unknown, { message: string }>;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onCancel: () => void;
  }) {
    const { state, onConfigure, onSave, onCancel } = props;
    if (view.form === undefined) return null;
    const decoded = state === null ? null : decodeFormState(state, { onExcessProperty: "ignore" });
    return view.form({ state: decoded, onConfigure, onSave, onCancel });
  }

  function viewFor(breakpoint: "sm" | "md" | "lg" | "xl") {
    const overlay = view[breakpoint];
    const generator = resolvedGenerator(
      module.id,
      breakpoint,
      module.catalog,
      view.default.generator,
      overlay?.generator,
    );
    return {
      defaultWidth: overlay?.defaultWidth ?? view.default.defaultWidth,
      minWidth: view.default.minWidth,
      component: authoredComponents[breakpoint],
      spec: generator?.defaultSpec ?? emptySpec,
      registry: generator?.registry,
    };
  }

  function Brick(props: { state?: unknown; breakpoint: "sm" | "md" | "lg" | "xl"; spec: Spec }) {
    const { state, breakpoint, spec } = props;
    const Placeholder = view.default.placeholder;
    if (state === null) {
      return <Placeholder />;
    }
    if (
      state !== null &&
      typeof state === "object" &&
      "data" in state &&
      state.data === null &&
      "resolution" in state
    ) {
      const resolution = state.resolution;
      const error =
        resolution !== null && typeof resolution === "object" && "error" in resolution
          ? resolution.error
          : null;
      return (
        <p role="status">
          {error !== null &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
            ? error.message
            : "Resolving…"}
        </p>
      );
    }
    const resolved = viewFor(breakpoint);
    const Authored = resolved.component;
    if (resolved.registry === undefined) {
      return <Authored state={state} />;
    }
    const initialState = makeInitialState(state);
    return (
      <StateProvider initialState={initialState}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            <Renderer spec={spec} registry={resolved.registry} />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    );
  }

  const defaultSpec = view.default.generator?.defaultSpec ?? emptySpec;
  const registry = view.default.generator?.registry;

  return {
    ...module,
    LineIcon: view.LineIcon,
    configureCommand: view.configureCommand,
    stateShape: module.stateShape,
    defaultState: module.defaultState,
    defaultSpec,
    placeholder: view.default.placeholder,
    ...(view.form === undefined ? {} : { Form }),
    ...(registry === undefined ? {} : { registry }),
    viewFor,
    component: Brick,
  };
}
