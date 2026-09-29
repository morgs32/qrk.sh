import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";
import { mapValues } from "es-toolkit";

const emptySpec: Spec = {
  root: "empty",
  elements: {},
};

function makeInitialState(state: unknown): Record<string, unknown> {
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const initialState: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      initialState[key] = value;
    }
    return initialState;
  }
  return {};
}

function assertBothOrNeitherWh(context: string, overlay: { w?: number; h?: number }) {
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
    def: {
      moduleId: string;
      state: unknown;
    };
  },
>(
  module: MODULE,
  view: {
    default: {
      component: (props: { state: InferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
      generator?: {
        registry: ComponentRegistry;
        defaultSpec: Spec;
      };
    };
  } & {
    [K in "sm" | "md" | "lg" | "xl"]?: {
      component?: (props: { state: InferDecodedRow<MODULE["stateShape"]> }) => ReactNode;
      generator?: {
        registry?: ComponentRegistry;
        defaultSpec?: Spec;
      };
      w?: number;
      h?: number;
    };
  },
) {
  if (view.default.generator !== undefined && module.catalog === undefined) {
    throw new Error(`makeModuleView: ${JSON.stringify(module.id)} has no catalog; omit generator`);
  }
  assertBothOrNeitherWh(`${JSON.stringify(module.id)}.sm`, view.sm ?? {});
  assertBothOrNeitherWh(`${JSON.stringify(module.id)}.md`, view.md ?? {});
  assertBothOrNeitherWh(`${JSON.stringify(module.id)}.lg`, view.lg ?? {});
  assertBothOrNeitherWh(`${JSON.stringify(module.id)}.xl`, view.xl ?? {});

  const decodeState = Schema.decodeUnknownSync(
    makeEffectSchema<MODULE["stateShape"]>(module.stateShape),
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
        const decoded = decodeState(state, { onExcessProperty: "preserve" });
        return <Component state={decoded} />;
      }
      authoredByComponent.set(Component, Authored);
      return Authored;
    },
  );

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
    };
  }

  function Brick(props: { state?: unknown; breakpoint: "sm" | "md" | "lg" | "xl"; spec: Spec }) {
    const { state, breakpoint, spec } = props;
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
    stateShape: module.stateShape,
    defaultState: module.defaultState,
    defaultSpec,
    ...(registry === undefined ? {} : { registry }),
    viewFor,
    component: Brick,
  };
}
