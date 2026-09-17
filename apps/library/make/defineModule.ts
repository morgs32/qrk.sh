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

function assertBothOrNeitherWh(props: {
  moduleId: string;
  breakpoint: string;
  w: number | undefined;
  h: number | undefined;
}) {
  const hasW = props.w !== undefined;
  const hasH = props.h !== undefined;
  if (hasW === hasH) return;
  throw new Error(
    `defineModule: ${props.breakpoint} must provide both w and h or neither; got ${JSON.stringify(props.moduleId)}`,
  );
}

function resolveBreakpoint(
  own:
    | {
        w?: number;
        h?: number;
        defaultSpec?: Spec;
        options?: { shape: IShape };
      }
    | undefined,
  inherited: {
    w: number | undefined;
    h: number | undefined;
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
  const w = own?.w ?? inherited.w;
  const h = own?.h ?? inherited.h;
  return {
    w,
    h,
    defaultSpec: own?.defaultSpec ?? inherited.defaultSpec,
    options,
  };
}

function defSize(w: number | undefined, h: number | undefined) {
  return {
    ...(w === undefined ? {} : { w }),
    ...(h === undefined ? {} : { h }),
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
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
    md?: {
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
    lg?: {
      w?: number;
      h?: number;
      defaultSpec?: Spec;
      options?: { shape: IShape };
    };
    xl?: {
      w?: number;
      h?: number;
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
  assertBothOrNeitherWh({
    moduleId: props.id,
    breakpoint: "sm",
    w: smInput.w,
    h: smInput.h,
  });
  for (const breakpoint of ["md", "lg", "xl"] as const) {
    const entry = props.breakpoints[breakpoint];
    if (entry === undefined) continue;
    assertBothOrNeitherWh({
      moduleId: props.id,
      breakpoint,
      w: entry.w,
      h: entry.h,
    });
  }

  const sm = {
    w: smInput.w,
    h: smInput.h,
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
    sm: defSize(sm.w, sm.h),
    md: defSize(md.w, md.h),
    lg: defSize(lg.w, lg.h),
    xl: defSize(xl.w, xl.h),
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
