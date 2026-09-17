import { defineCatalog, type Catalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { primitives, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { descriptorToZod, makeZodSchema } from "@zerospin/zod";
import { mapValues } from "es-toolkit";

import type { IJsonValue } from "../worker/types.public";
import { decodeDefaultData } from "./decodeDefaultData";
import type { defineComponent } from "./defineComponent";
import { defineModule } from "./defineModule";

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
  own: { w?: number; h?: number } | undefined,
  inherited: { w: number | undefined; h: number | undefined },
) {
  return {
    w: own?.w ?? inherited.w,
    h: own?.h ?? inherited.h,
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

/** Versioned module snapshot: components→catalog, state document, nested breakpoints. */
export function makeModuleVersion<
  const MODULE extends string,
  const VERSION extends string,
  const STATE_SHAPE extends IShape,
>(
  identity: Readonly<{
    id: MODULE;
    label: string;
    description: string;
  }>,
  props: {
    version: VERSION;
    components: Record<string, ReturnType<typeof defineComponent>>;
    stateShape: STATE_SHAPE;
    defaultState: InferDecodedRow<STATE_SHAPE> & Readonly<Record<string, IJsonValue>>;
    breakpoints: {
      sm: { w?: number; h?: number };
      md?: { w?: number; h?: number };
      lg?: { w?: number; h?: number };
      xl?: { w?: number; h?: number };
    };
  },
) {
  const { id, label, description } = defineModule(identity);
  assertSemVer(props.version);

  const catalog = makeCatalogFromComponents(props.components);
  const defaultState = decodeDefaultData(props.stateShape, props.defaultState);

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

  const sm = { w: smInput.w, h: smInput.h };
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
    state: defaultState as unknown,
  };

  return {
    id,
    label,
    description,
    version: props.version,
    catalog,
    stateShape: props.stateShape,
    defaultState,
    breakpoints,
    def,
  };
}
