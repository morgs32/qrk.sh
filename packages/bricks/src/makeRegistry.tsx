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
    w: number;
    h: number;
    order: number;
    form?: ReturnType<typeof makeAppearanceForm>;
    xs: (props: PROPS) => ReactNode;
    sm?: (props: NoInfer<PROPS>) => ReactNode;
    lg?: (props: NoInfer<PROPS>) => ReactNode;
    xl?: (props: NoInfer<PROPS>) => ReactNode;
  } & (
    | {
        dataShape: null;
        defaultData: null;
        configuration?: never;
        xs: (props: { breakpoint: "xs" | "sm" | "lg" | "xl" }) => ReactNode;
      }
    | {
        dataShape: DATA_SHAPE;
        defaultData: InferDecodedRow<DATA_SHAPE> & Readonly<Record<string, IJsonValue>>;
        configuration?:
          | ReturnType<typeof makeFetcherConfiguration<REGISTRY_OPTIONS_SHAPE>>
          | IFormConfiguration<InferDecodedRow<DATA_SHAPE>>;
        xs: (props: {
          data: InferDecodedRow<DATA_SHAPE>;
          breakpoint: "xs" | "sm" | "lg" | "xl";
        }) => ReactNode;
      }
  ),
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.registry)) {
    throw new Error(
      `makeRegistry: registry must be kebab-case; got ${JSON.stringify(props.registry)}`,
    );
  }

  /** Omitted breakpoints inherit the nearest smaller presentation. */
  function Brick(
    propsForBrick: NoInfer<PROPS> & {
      breakpoint: "xs" | "sm" | "lg" | "xl";
      appearanceOptions?: unknown;
    },
  ) {
    let Presentation: (props: PROPS) => ReactNode = props.xs;
    if (propsForBrick.breakpoint !== "xs" && props.sm) Presentation = props.sm;
    if ((propsForBrick.breakpoint === "lg" || propsForBrick.breakpoint === "xl") && props.lg)
      Presentation = props.lg;
    if (propsForBrick.breakpoint === "xl" && props.xl) Presentation = props.xl;
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
    w: props.w,
    h: props.h,
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
