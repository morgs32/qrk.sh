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
import type { makeBreakpointOptions } from "./makeBreakpointOptions";
import type { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IJsonValue } from "../worker/types.public";

function mergeBrickState(data: unknown, breakpointOptions: unknown): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      state[key] = value;
    }
  }
  if (
    breakpointOptions !== null &&
    typeof breakpointOptions === "object" &&
    !Array.isArray(breakpointOptions)
  ) {
    for (const [key, value] of Object.entries(breakpointOptions)) {
      state[key] = value;
    }
  }
  return state;
}

/** Bind catalog presentation (defaultSpec + registry) to one responsive brick. */
export function makeModule<
  const MODULE extends string,
  const PAYLOAD_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
>(
  props: {
    id: MODULE;
    label: string;
    description: string;
    defaultSpec: Spec;
    registry: ComponentRegistry;
    breakpointOptions?: ReturnType<typeof makeBreakpointOptions>;
    sm: { w: number; h: number };
    md?: { w: number; h: number };
    lg?: { w: number; h: number };
    xl?: { w: number; h: number };
    /**
     * When true (default), library module-list previews may grow to intrinsic
     * content size. Set false for modules that should keep declared grid size.
     */
    measurable?: boolean;
    /**
     * Optional brick body when the default Renderer path is not enough
     * (e.g. client-side fetch before StateProvider). Must still render via
     * json-render using props.defaultSpec and props.registry.
     */
    brick?: (props: {
      data: unknown;
      breakpointOptions: unknown;
      breakpoint: "sm" | "md" | "lg" | "xl";
      defaultSpec: Spec;
      spec?: Spec;
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
          | ReturnType<typeof makeFetcherConfiguration<PAYLOAD_SHAPE>>
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
  const measurable = props.measurable ?? true;

  function Brick(propsForBrick: {
    data?: unknown;
    breakpoint: "sm" | "md" | "lg" | "xl";
    breakpointOptions?: unknown;
    spec?: Spec;
  }) {
    const breakpointOptions =
      propsForBrick.breakpointOptions ?? props.breakpointOptions?.defaultValue ?? {};
    const spec = propsForBrick.spec ?? defaultSpec;
    if (customBrick !== undefined) {
      return (
        <BrickFrame>
          {customBrick({
            data: propsForBrick.data,
            breakpointOptions,
            breakpoint: propsForBrick.breakpoint,
            defaultSpec,
            spec,
            registry,
          })}
        </BrickFrame>
      );
    }
    const initialState = mergeBrickState(propsForBrick.data, breakpointOptions);
    return (
      <BrickFrame>
        <StateProvider initialState={initialState}>
          <VisibilityProvider>
            <ActionProvider handlers={{}}>
              <Renderer spec={spec} registry={registry} />
            </ActionProvider>
          </VisibilityProvider>
        </StateProvider>
      </BrickFrame>
    );
  }
  Brick.breakpointOptions = props.breakpointOptions;
  const def = {
    moduleId: props.id,
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
      measurable,
      dataShape: null,
      defaultData: null,
      defaultSpec,
      registry,
      configuration: null,
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
    measurable,
    dataShape: props.dataShape,
    defaultData,
    defaultSpec,
    registry,
    configuration: props.configuration ?? null,
    def: {
      ...def,
      data: defaultData,
    },
    component: Brick,
  };
}
