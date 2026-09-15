import type { ReactNode } from "react";

import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

import { BrickFrame } from "./BrickFrame";
import type { makeOptions } from "./makeOptions";
import type { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IJsonValue } from "./worker/types.public";

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
    sm: { component: (props: PROPS) => ReactNode; w: number; h: number };
    md?: { component: (props: NoInfer<PROPS>) => ReactNode; w: number; h: number };
    lg?: { component: (props: NoInfer<PROPS>) => ReactNode; w: number; h: number };
    xl?: { component: (props: NoInfer<PROPS>) => ReactNode; w: number; h: number };
  } & (
    | {
        dataShape: null;
        defaultData: null;
        configuration?: never;
        sm: {
          component: (props: {
            breakpoint: "sm" | "md" | "lg" | "xl";
            options?: unknown;
          }) => ReactNode;
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
        sm: {
          component: (props: {
            data: InferDecodedRow<DATA_SHAPE>;
            breakpoint: "sm" | "md" | "lg" | "xl";
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
  const sm = props.sm;
  const md = props.md ?? sm;
  const lg = props.lg ?? md;
  const xl = props.xl ?? lg;
  const presentations = { sm, md, lg, xl };

  /** Omitted breakpoints inherit the nearest smaller component and dimensions. */
  function Brick(
    propsForBrick: NoInfer<PROPS> & {
      breakpoint: "sm" | "md" | "lg" | "xl";
      options?: unknown;
    },
  ) {
    const Presentation = presentations[propsForBrick.breakpoint].component;
    return (
      <BrickFrame>
        <Presentation
          {...propsForBrick}
          options={propsForBrick.options ?? props.options?.defaultValue ?? {}}
        />
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
