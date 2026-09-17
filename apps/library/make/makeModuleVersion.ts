import { defineCatalog, type Catalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { primitives, type IShape } from "@zerospin/schema";
import { descriptorToZod, makeZodSchema } from "@zerospin/zod";
import { mapValues } from "es-toolkit";

import { makeBreakpointOptionShape } from "./breakpointOptions";
import type { defineComponent } from "./defineComponent";
import { defineModule } from "./defineModule";
import type { makeData } from "./makeData";
import type { makeDataFetcher } from "./makeDataFetcher";
import type { makeDataForm } from "./makeDataForm";

const stateRefSchema = makeZodSchema({
  $state: primitives.text(),
});

const semVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function assertSemVer(version: string) {
  if (!semVerPattern.test(version)) {
    throw new Error(`makeModuleVersion: version must be SemVer; got ${JSON.stringify(version)}`);
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
    `makeModuleVersion: ${props.breakpoint} must provide both w and h or neither; got ${JSON.stringify(props.moduleId)}`,
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

function makeCatalogFromComponents(
  components: Record<string, ReturnType<typeof defineComponent>>,
): Catalog {
  for (const [key, component] of Object.entries(components)) {
    if (key !== component.type) {
      throw new Error(
        `makeModuleVersion: components key ${JSON.stringify(key)} must equal type ${JSON.stringify(component.type)}`,
      );
    }
  }

  const catalogComponents = mapValues(components, component => {
    const dynamicProps = makeZodSchema({}).extend(
      mapValues(component.props, descriptor => {
        const dynamicField = descriptorToZod(descriptor).or(stateRefSchema);
        if (
          descriptor !== undefined &&
          typeof descriptor === "object" &&
          "nullable" in descriptor &&
          descriptor.nullable === true
        ) {
          return dynamicField.optional();
        }
        return dynamicField;
      }),
    );

    return {
      props: dynamicProps,
      ...(component.slots === undefined ? {} : { slots: [...component.slots] }),
      ...(component.description === undefined ? {} : { description: component.description }),
    };
  });

  return defineCatalog(schema, {
    components: catalogComponents,
    actions: {},
  });
}

/** Versioned module snapshot: components→catalog, data discriminant, nested breakpoints. */
export function makeModuleVersion<
  const MODULE extends string,
  const VERSION extends string,
  const DATA extends
    | null
    | ReturnType<typeof makeData>
    | ReturnType<typeof makeDataForm>
    | ReturnType<typeof makeDataFetcher>,
>(
  identity: Readonly<{
    id: MODULE;
    label: string;
    description: string;
  }>,
  props: {
    version: VERSION;
    components: Record<string, ReturnType<typeof defineComponent>>;
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
  },
) {
  const { id, label, description } = defineModule(identity);
  assertSemVer(props.version);

  const catalog = makeCatalogFromComponents(props.components);

  const smInput = props.breakpoints.sm;
  assertBothOrNeitherWh({
    moduleId: id,
    breakpoint: "sm",
    w: smInput.w,
    h: smInput.h,
  });
  for (const breakpoint of ["md", "lg", "xl"] as const) {
    const entry = props.breakpoints[breakpoint];
    if (entry === undefined) continue;
    assertBothOrNeitherWh({
      moduleId: id,
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
    moduleId: id,
    sm: defSize(sm.w, sm.h),
    md: defSize(md.w, md.h),
    lg: defSize(lg.w, lg.h),
    xl: defSize(xl.w, xl.h),
    data: (props.data === null ? null : props.data.defaultData) as unknown,
  };

  if (props.data === null) {
    return {
      id,
      label,
      description,
      version: props.version,
      catalog,
      data: null,
      dataShape: null,
      defaultData: null,
      breakpoints,
      def,
    };
  }

  return {
    id,
    label,
    description,
    version: props.version,
    catalog,
    data: props.data,
    dataShape: props.data.dataShape,
    defaultData: props.data.defaultData,
    breakpoints,
    def,
  };
}
