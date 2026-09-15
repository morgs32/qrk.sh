import type { ReactNode } from "react";

import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

import type { makeOptions } from "./makeOptions";
import type { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IJsonValue } from "./scraper/types.public";

/** Bind data and configuration to one responsive brick presentation. */
export function makeModule<
  const MODULE extends string,
  const MODULE_OPTIONS_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
  PROPS extends object,
>(
  props: {
    id: MODULE;
    label: string;
    description: string;
    options?: ReturnType<typeof makeOptions>;
    xs: { component: (props: PROPS) => ReactNode; w: number; h: number };
    sm?: { component: (props: NoInfer<PROPS>) => ReactNode; w: number; h: number };
    lg?: { component: (props: NoInfer<PROPS>) => ReactNode; w: number; h: number };
    xl?: { component: (props: NoInfer<PROPS>) => ReactNode; w: number; h: number };
  } & (
    | {
        dataShape: null;
        defaultData: null;
        configuration?: never;
        xs: {
          component: (props: { breakpoint: "xs" | "sm" | "lg" | "xl" }) => ReactNode;
          w: number;
          h: number;
        };
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?:
          | ReturnType<typeof makeFetcherConfiguration<MODULE_OPTIONS_SHAPE>>
          | IFormConfiguration<InferDecodedRow<DATA_SHAPE>>;
        xs: {
          component: (props: {
            data: InferDecodedRow<DATA_SHAPE>;
            breakpoint: "xs" | "sm" | "lg" | "xl";
          }) => ReactNode;
          w: number;
          h: number;
        };
      }
  ),
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.id)) {
    throw new Error(`makeModule: id must be kebab-case; got ${JSON.stringify(props.id)}`);
  }

  // Resolve complete entries once so the renderer and serialized dimensions agree.
  const xs = props.xs;
  const sm = props.sm ?? xs;
  const lg = props.lg ?? sm;
  const xl = props.xl ?? lg;
  const presentations = { xs, sm, lg, xl };

  /** Omitted breakpoints inherit the nearest smaller component and dimensions. */
  function Brick(
    propsForBrick: NoInfer<PROPS> & {
      breakpoint: "xs" | "sm" | "lg" | "xl";
      options?: unknown;
    },
  ) {
    const Presentation = presentations[propsForBrick.breakpoint].component;
    return (
      <Presentation
        {...propsForBrick}
        options={propsForBrick.options ?? props.options?.defaultValue ?? {}}
      />
    );
  }
  Brick.options = props.options;
  const def = {
    moduleId: props.id,
    moduleLabel: props.label,
    xs: { w: xs.w, h: xs.h },
    sm: { w: sm.w, h: sm.h },
    lg: { w: lg.w, h: lg.h },
    xl: { w: xl.w, h: xl.h },
    data: null as unknown};
  if (props.dataShape === null) {
    return {
      id: props.id,
      label: props.label,
      description: props.description,
      dataShape: null,
      defaultData: null,
      configuration: undefined,
      def: {
        ...def,
        data: null},
      component: Brick};
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
    configuration: props.configuration,
    def: {
      ...def,
      data: defaultData},
    component: Brick};
}
