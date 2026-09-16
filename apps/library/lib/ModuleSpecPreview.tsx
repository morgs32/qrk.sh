"use client";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";

function mergeBrickState(data: unknown, options: unknown): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      state[key] = value;
    }
  }
  if (options !== null && typeof options === "object" && !Array.isArray(options)) {
    for (const [key, value] of Object.entries(options)) {
      state[key] = value;
    }
  }
  return state;
}

/** Preview a module json-render spec against current data/options state. */
export function ModuleSpecPreview(props: {
  data: unknown;
  options?: unknown;
  spec: Spec;
  registry: ComponentRegistry;
}) {
  const initialState = mergeBrickState(props.data, props.options);

  return (
    <div className="size-full overflow-hidden" data-module-spec-preview>
      <StateProvider initialState={initialState}>
        <VisibilityProvider>
          <ActionProvider handlers={{}}>
            <Renderer spec={props.spec} registry={props.registry} />
          </ActionProvider>
        </VisibilityProvider>
      </StateProvider>
    </div>
  );
}
