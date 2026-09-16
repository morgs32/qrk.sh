import type { ReactNode } from "react";

import type { Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";
import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

import { BrickFrame } from "../components/brick/BrickFrame";
import type { makeOptions } from "./makeOptions";
import type { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IJsonValue } from "../worker/types.public";

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

/** Bind catalog presentation (defaultSpec + registry) to one responsive brick. */
export function makeModule<
  const MODULE extends string,
  const MODULE_OPTIONS_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
>(
  props: {
    id: MODULE;
    label: string;
    description: string;
    defaultSpec: Spec;
    registry: ComponentRegistry;
    options?: ReturnType<typeof makeOptions>;
    sm: { w: number; h: number };
    md?: { w: number; h: number };
    lg?: { w: number; h: number };
    xl?: { w: number; h: number };
    /**
     * Optional brick body when the default Renderer path is not enough
     * (e.g. client-side fetch before StateProvider). Must still render via
     * json-render using props.defaultSpec and props.registry.
     */
    brick?: (props: {
      data: unknown;
      options: unknown;
      breakpoint: "sm" | "md" | "lg" | "xl";
      defaultSpec: Spec;
      registry: ComponentRegistry;
    }) => ReactNode;
  } & (
    | {
        dataShape: null;
        defaultData: null;
        configuration?: never;
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?:
          | ReturnType<typeof makeFetcherConfiguration<MODULE_OPTIONS_SHAPE>>
          | IFormConfiguration<InferDecodedRow<DATA_SHAPE>>;
      }
  ),
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.id)) {
    throw new Error(`makeModule: id must be kebab-case; got ${JSON.stringify(props.id)}`);
  }

  const sm = props.sm;
  const md = props.md ?? sm;
  const lg = props.lg ?? md;
  const xl = props.xl ?? lg;
  const defaultSpec = props.defaultSpec;
  const registry = props.registry;
  const customBrick = props.brick;

  function Brick(propsForBrick: {
    data?: unknown;
    breakpoint: "sm" | "md" | "lg" | "xl";
    options?: unknown;
  }) {
    const options = propsForBrick.options ?? props.options?.defaultValue ?? {};
    if (customBrick !== undefined) {
      return (
        <BrickFrame>
          {customBrick({
            data: propsForBrick.data,
            options,
            breakpoint: propsForBrick.breakpoint,
            defaultSpec,
            registry,
          })}
        </BrickFrame>
      );
    }
    const initialState = mergeBrickState(propsForBrick.data, options);
    return (
      <BrickFrame>
        <StateProvider initialState={initialState}>
          <VisibilityProvider>
            <ActionProvider handlers={{}}>
              <Renderer spec={defaultSpec} registry={registry} />
            </ActionProvider>
          </VisibilityProvider>
        </StateProvider>
      </BrickFrame>
    );
  }
  Brick.options = props.options;
  const def = {
    moduleId: props.id,
    moduleLabel: props.label,
    sm: { w: sm.w, h: sm.h },
    md: { w: md.w, h: md.h },
    lg: { w: lg.w, h: lg.h },
    xl: { w: xl.w, h: xl.h },
    data: null as unknown,
  };
  if (props.dataShape === null) {
    return {
      id: props.id,
      label: props.label,
      description: props.description,
      dataShape: null,
      defaultData: null,
      defaultSpec,
      registry,
      configuration: undefined,
      def: {
        ...def,
        data: null,
      },
      component: Brick,
    };
  }
  const defaultData = Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(props.dataShape)))(
    props.defaultData,
    { onExcessProperty: "preserve" },
  );
  return {
    id: props.id,
    label: props.label,
    description: props.description,
    dataShape: props.dataShape,
    defaultData,
    defaultSpec,
    registry,
    configuration: props.configuration,
    def: {
      ...def,
      data: defaultData,
    },
    component: Brick,
  };
}
