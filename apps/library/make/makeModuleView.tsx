import type { ILibrarySession } from "../session/createLibraryStandaloneSession";
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

function assertBreakpointSize(
  context: string,
  overlay: { w?: number; h?: number; minW?: number; minH?: number },
) {
  const hasW = overlay.w !== undefined;
  const hasH = overlay.h !== undefined;
  if (hasW !== hasH) {
    throw new Error(`makeModuleView: ${context} w and h must both be set or both omitted`);
  }
  if (hasW && (overlay.w === undefined || overlay.w < 1 || !Number.isInteger(overlay.w))) {
    throw new Error(`makeModuleView: ${context} w must be an integer ≥ 1`);
  }
  if (hasH && (overlay.h === undefined || overlay.h < 1 || !Number.isInteger(overlay.h))) {
    throw new Error(`makeModuleView: ${context} h must be an integer ≥ 1`);
  }
  if (
    overlay.minW !== undefined &&
    (!Number.isInteger(overlay.minW) || overlay.minW < 1 || overlay.minW > 8)
  ) {
    throw new Error(`makeModuleView: ${context} minW must be an integer between 1 and 8`);
  }
  if (overlay.minH !== undefined && (!Number.isInteger(overlay.minH) || overlay.minH < 1)) {
    throw new Error(`makeModuleView: ${context} minH must be an integer ≥ 1`);
  }
  if (overlay.w !== undefined && overlay.minW !== undefined && overlay.w < overlay.minW) {
    throw new Error(`makeModuleView: ${context} w must be ≥ minW`);
  }
  if (overlay.h !== undefined && overlay.minH !== undefined && overlay.h < overlay.minH) {
    throw new Error(`makeModuleView: ${context} h must be ≥ minH`);
  }
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

/** View factory: authored component, optional json-render generator, optional sm/md/lg/xl overlays. */
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
    measureOnSave?: boolean;
    form?: (props: {
      state: IInferDecodedRow<MODULE["stateShape"]> | null;
      session: ILibrarySession;
      brickId: `brk_${string}`;
      onSave: (
        state: IInferDecodedRow<MODULE["stateShape"]>,
      ) => IResult<unknown, { message: string }>;
      onCancel: () => void;
    }) => ReactNode;
    default: {
      component: (props: { state: IInferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
      placeholder?: () => ReactNode;
      generator?: {
        registry: ComponentRegistry;
        defaultSpec: Spec;
      };
    };
  } & {
    [K in "sm" | "md" | "lg" | "xl"]?: {
      component?: (props: { state: IInferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
      generator?: {
        registry?: ComponentRegistry;
        defaultSpec?: Spec;
      };
      w?: number;
      h?: number;
      minW?: number;
      minH?: number;
    };
  },
) {
  if (module.hasPlaceholder !== (view.default.placeholder !== undefined)) {
    throw new Error(
      `makeModuleView: ${JSON.stringify(module.id)} hasPlaceholder must match default.placeholder`,
    );
  }
  if (view.default.generator !== undefined && module.catalog === undefined) {
    throw new Error(`makeModuleView: ${JSON.stringify(module.id)} has no catalog; omit generator`);
  }
  assertBreakpointSize(`${JSON.stringify(module.id)}.sm`, view.sm ?? {});
  assertBreakpointSize(`${JSON.stringify(module.id)}.md`, view.md ?? {});
  assertBreakpointSize(`${JSON.stringify(module.id)}.lg`, view.lg ?? {});
  assertBreakpointSize(`${JSON.stringify(module.id)}.xl`, view.xl ?? {});

  const decodeState = Schema.decodeUnknownSync(
    makeEffectSchema<MODULE["stateShape"]>(module.stateShape),
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
        const decoded = decodeState(state, { onExcessProperty: "ignore" });
        return <Component state={decoded} />;
      }
      authoredByComponent.set(Component, Authored);
      return Authored;
    },
  );

  function Form(props: {
    state: unknown;
    session: ILibrarySession;
    brickId: `brk_${string}`;
    onSave: (state: unknown) => IResult<unknown, { message: string }>;
    onCancel: () => void;
  }) {
    const { state, session, brickId, onSave, onCancel } = props;
    if (view.form === undefined) return null;
    const decoded = state === null ? null : decodeFormState(state, { onExcessProperty: "ignore" });
    return view.form({ state: decoded, session, brickId, onSave, onCancel });
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
      component: authoredComponents[breakpoint],
      spec: generator?.defaultSpec ?? emptySpec,
      registry: generator?.registry,
      w: overlay?.w,
      h: overlay?.h,
      minW: overlay?.minW,
      minH: overlay?.minH,
    };
  }

  function Brick(props: { state?: unknown; breakpoint: "sm" | "md" | "lg" | "xl"; spec: Spec }) {
    const { state, breakpoint, spec } = props;
    const Placeholder = view.default.placeholder;
    if (state === null && Placeholder !== undefined) {
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
    stateShape: module.stateShape,
    defaultState: module.defaultState,
    defaultSpec,
    measureOnSave: view.measureOnSave ?? false,
    placeholder: view.default.placeholder,
    ...(view.form === undefined ? {} : { Form }),
    ...(registry === undefined ? {} : { registry }),
    viewFor,
    component: Brick,
  };
}
