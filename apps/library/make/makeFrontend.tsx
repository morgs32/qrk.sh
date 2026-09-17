import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";
import { type IShape } from "@zerospin/schema";

import { BrickFrame } from "../components/brick/BrickFrame";

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

export function makeFrontend<
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
  frontend: {
    component: {
      bivarianceHack(props: { state: unknown }): ReactNode;
    }["bivarianceHack"];
    defaultSpec: Spec;
  } & (MODULE extends { catalog: Catalog }
    ? { registry: ComponentRegistry }
    : { registry?: never }),
) {
  const registry = "registry" in frontend ? frontend.registry : undefined;
  if (module.catalog !== undefined && registry === undefined) {
    throw new Error(`makeFrontend: ${JSON.stringify(module.id)} has catalog and requires registry`);
  }
  if (module.catalog === undefined && registry !== undefined) {
    throw new Error(`makeFrontend: ${JSON.stringify(module.id)} has no catalog; omit registry`);
  }

  const Authored = frontend.component;
  const defaultSpec = frontend.defaultSpec;

  function Brick(propsForBrick: {
    state?: unknown;
    breakpoint: "sm" | "md" | "lg" | "xl";
    spec: Spec;
  }) {
    if (registry === undefined) {
      return (
        <BrickFrame>
          <Authored state={propsForBrick.state} />
        </BrickFrame>
      );
    }
    const initialState = initialStateFromDocument(propsForBrick.state);
    return (
      <BrickFrame>
        <StateProvider initialState={initialState}>
          <VisibilityProvider>
            <ActionProvider handlers={{}}>
              <Renderer spec={propsForBrick.spec} registry={registry} />
            </ActionProvider>
          </VisibilityProvider>
        </StateProvider>
      </BrickFrame>
    );
  }

  return {
    ...module,
    stateShape: module.stateShape,
    defaultState: module.defaultState,
    defaultSpec,
    ...(registry === undefined ? {} : { registry }),
    component: Brick,
  };
}
