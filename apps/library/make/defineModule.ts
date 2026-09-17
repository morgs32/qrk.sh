import type { Catalog, Spec } from "@json-render/core";
import type { IShape } from "@zerospin/schema";

import { makeBreakpointOptionShape } from "./breakpointOptions";
import type { makeData } from "./makeData";
import type { makeDataFetcher } from "./makeDataFetcher";
import type { makeDataForm } from "./makeDataForm";

function assertKebabCaseId(id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`defineModule: id must be kebab-case; got ${JSON.stringify(id)}`);
  }
}

function resolveBreakpoint(
  own:
    | {
        w?: number;
        h?: number;
        measurable?: boolean;
        defaultSpec?: Spec;
        options?: { shape: IShape };
      }
    | undefined,
  inherited: {
    w: number;
    h: number;
    measurable: boolean;
    defaultSpec: Spec | undefined;
    options: ReturnType<typeof makeBreakpointOptionShape> | undefined;
  },
) {
  const options =
    own !== undefined && Object.prototype.hasOwnProperty.call(own, "options")
      ? own.options === undefined
        ? undefined
        : makeBreakpointOptionShape(own.options.shape)
      : inherited.options;
  return {
    w: own?.w ?? inherited.w,
    h: own?.h ?? inherited.h,
    measurable: own?.measurable ?? inherited.measurable,
    defaultSpec: own?.defaultSpec ?? inherited.defaultSpec,
    options,
  };
}

/** Worker-safe module contract: optional catalog, data discriminant, nested breakpoints. */
export function defineModule<
  const MODULE extends string,
  const DATA extends
    | null
    | ReturnType<typeof makeData>
    | ReturnType<typeof makeDataForm>
    | ReturnType<typeof makeDataFetcher>,
>(props: {
  id: MODULE;
  label: string;
  description: string;
  catalog?: Catalog;
  data: DATA;
  breakpoints: {
    sm: {
      w: number;
      h: number;
      measurable?: boolean;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
    md?: {
      w?: number;
      h?: number;
      measurable?: boolean;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
    lg?: {
      w?: number;
      h?: number;
      measurable?: boolean;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
    xl?: {
      w?: number;
      h?: number;
      measurable?: boolean;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
  };
}) {
  assertKebabCaseId(props.id);

  if (props.catalog === undefined) {
    const hasDefaultSpec =
      props.breakpoints.sm.defaultSpec !== undefined ||
      props.breakpoints.md?.defaultSpec !== undefined ||
      props.breakpoints.lg?.defaultSpec !== undefined ||
      props.breakpoints.xl?.defaultSpec !== undefined;
    if (hasDefaultSpec) {
      throw new Error(
        `defineModule: defaultSpec requires catalog; got ${JSON.stringify(props.id)}`,
      );
    }
  }

  const smInput = props.breakpoints.sm;
  const sm = {
    w: smInput.w,
    h: smInput.h,
    measurable: smInput.measurable ?? true,
    defaultSpec: smInput.defaultSpec,
    options:
      smInput.options === undefined ? undefined : makeBreakpointOptionShape(smInput.options.shape),
  };
  const md = resolveBreakpoint(props.breakpoints.md, sm);
  const lg = resolveBreakpoint(props.breakpoints.lg, md);
  const xl = resolveBreakpoint(props.breakpoints.xl, lg);
  const breakpoints = { sm, md, lg, xl };
  const def = {
    moduleId: props.id,
    sm: { w: sm.w, h: sm.h },
    md: { w: md.w, h: md.h },
    lg: { w: lg.w, h: lg.h },
    xl: { w: xl.w, h: xl.h },
    data: (props.data === null ? null : props.data.defaultData) as unknown,
  };

  if (props.data === null) {
    if (props.catalog === undefined) {
      return {
        id: props.id,
        label: props.label,
        description: props.description,
        data: null,
        dataShape: null,
        defaultData: null,
        breakpoints,
        def,
      };
    }
    return {
      id: props.id,
      label: props.label,
      description: props.description,
      catalog: props.catalog,
      data: null,
      dataShape: null,
      defaultData: null,
      breakpoints,
      def,
    };
  }

  if (props.catalog === undefined) {
    return {
      id: props.id,
      label: props.label,
      description: props.description,
      data: props.data,
      dataShape: props.data.dataShape,
      defaultData: props.data.defaultData,
      breakpoints,
      def,
    };
  }

  return {
    id: props.id,
    label: props.label,
    description: props.description,
    catalog: props.catalog,
    data: props.data,
    dataShape: props.data.dataShape,
    defaultData: props.data.defaultData,
    breakpoints,
    def,
  };
}
