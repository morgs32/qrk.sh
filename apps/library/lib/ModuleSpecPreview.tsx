"use client";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";

function initialStateFromDocument(state: unknown): Record<string, unknown> {
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const initialState: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      initialState[key] = value;
    }
    return initialState;
  }
  return {};
}

/** Preview a module json-render spec against current brick state. */
export function ModuleSpecPreview(props: {
  state: unknown;
  spec: Spec;
  registry: ComponentRegistry;
}) {
  const initialState = initialStateFromDocument(props.state);

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
