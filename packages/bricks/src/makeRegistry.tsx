import type { ReactNode } from "react";

import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

import type { makeAppearanceForm } from "./makeAppearanceForm";
import type { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IJsonValue } from "./scraper/types.public";

/** Bind data and configuration to one responsive brick presentation. */
export function makeRegistry<
  const REGISTRY extends string,
  const REGISTRY_OPTIONS_SHAPE extends IShape,
  const DATA_SHAPE extends IShape,
  PROPS extends object,
>(
  props: {
    registry: REGISTRY;
    registryName: string;
    registryDescription: string;
    order: number;
    form?: ReturnType<typeof makeAppearanceForm>;
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
          | ReturnType<typeof makeFetcherConfiguration<REGISTRY_OPTIONS_SHAPE>>
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
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.registry)) {
    throw new Error(
      `makeRegistry: registry must be kebab-case; got ${JSON.stringify(props.registry)}`,
    );
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
      appearanceOptions?: unknown;
    },
  ) {
    const Presentation = presentations[propsForBrick.breakpoint].component;
    return (
      <Presentation
        {...propsForBrick}
        appearanceOptions={propsForBrick.appearanceOptions ?? props.form?.defaultValue ?? {}}
      />
    );
  }
  Brick.form = props.form;
  const def = {
    registry: props.registry,
    xs: { w: xs.w, h: xs.h },
    sm: { w: sm.w, h: sm.h },
    lg: { w: lg.w, h: lg.h },
    xl: { w: xl.w, h: xl.h },
    label: props.registryName,
    order: props.order,
  };
  if (props.dataShape === null) {
    return {
      registryName: props.registryName,
      registryDescription: props.registryDescription,
      dataShape: null,
      defaultData: null,
      configuration: undefined,
      def,
      component: Brick,
    };
  }
  const defaultData = Schema.decodeUnknownSync(Schema.toType(makeEffectSchema(props.dataShape)))(
    props.defaultData,
    { onExcessProperty: "preserve" },
  );
  return {
    registryName: props.registryName,
    registryDescription: props.registryDescription,
    dataShape: props.dataShape,
    defaultData,
    configuration: props.configuration,
    def,
    component: Brick,
  };
}
