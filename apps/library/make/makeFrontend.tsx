import type { ReactNode } from "react";

import type { Catalog, Spec } from "@json-render/core";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  type ComponentRegistry,
} from "@json-render/react";
import {
  makeEffectSchema,
  PrimitiveKind,
  type InferDecodedRow,
  type IShape,
} from "@zerospin/schema";
import { Schema } from "effect";

import { BrickFrame } from "../components/brick/BrickFrame";
import { Switch } from "../components/ui/switch";
import type { makeBreakpointOptionShape } from "./breakpointOptions";

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

function shapeAllowsAutomaticControls(shape: IShape) {
  return Object.entries(shape).every(
    ([, descriptor]) =>
      descriptor.kind === PrimitiveKind.Boolean &&
      descriptor.nullable === false &&
      "defaultValue" in descriptor &&
      typeof descriptor.defaultValue === "boolean",
  );
}

function wrapOptionsForm(props: {
  shape: IShape;
  defaultValue: InferDecodedRow<IShape>;
  Form?: {
    bivarianceHack(props: {
      value: InferDecodedRow<IShape>;
      onChange: { bivarianceHack(value: InferDecodedRow<IShape>): void }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
}) {
  const schema = Schema.toType(makeEffectSchema(props.shape));
  const Form = props.Form;
  return function BreakpointOptionsForm({
    value,
    onChange,
  }: {
    value: unknown;
    onChange: (value: unknown) => void;
  }) {
    const withDefaults =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? { ...props.defaultValue, ...value }
        : value;
    const decodedValue = Schema.decodeUnknownSync(schema)(withDefaults, {
      onExcessProperty: "error",
    });
    if (Form === undefined) {
      return (
        <div className="space-y-3 py-5">
          {Object.keys(props.shape).map((name) => {
            const words = name
              .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
              .replace(/[_-]+/g, " ")
              .toLowerCase();
            const label = words.charAt(0).toUpperCase() + words.slice(1);
            return (
              <label key={name} className="flex items-center gap-3">
                <Switch
                  aria-label={label}
                  checked={decodedValue[name] === true}
                  onCheckedChange={(checked) => {
                    const result = Schema.decodeUnknownOption(schema)(
                      { ...decodedValue, [name]: checked },
                      { onExcessProperty: "error" },
                    );
                    if (result._tag === "Some") onChange(result.value);
                  }}
                />
                {label}
              </label>
            );
          })}
        </div>
      );
    }
    return (
      <Form
        value={decodedValue}
        onChange={(nextValue) => {
          const result = Schema.decodeUnknownOption(schema)(nextValue, {
            onExcessProperty: "error",
          });
          if (result._tag === "Some") onChange(result.value);
        }}
      />
    );
  };
}

function resolveOptionsForm(props: {
  moduleId: string;
  breakpoint: "sm" | "md" | "lg" | "xl";
  options:
    | {
        shape: IShape;
        defaultValue: InferDecodedRow<IShape>;
        decode: (value: unknown) => unknown;
      }
    | undefined;
  inheritedForm:
    | {
        bivarianceHack(props: {
          value: unknown;
          onChange: { bivarianceHack(value: unknown): void }["bivarianceHack"];
        }): ReactNode;
      }["bivarianceHack"]
    | undefined;
  inheritedOptions:
    | {
        shape: IShape;
      }
    | undefined;
  form?: {
    bivarianceHack(props: {
      value: InferDecodedRow<IShape>;
      onChange: { bivarianceHack(value: InferDecodedRow<IShape>): void }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
}) {
  if (props.options === undefined) {
    return undefined;
  }
  const shapeInherited =
    props.inheritedOptions !== undefined && props.inheritedOptions.shape === props.options.shape;
  if (props.form !== undefined) {
    return wrapOptionsForm({
      shape: props.options.shape,
      defaultValue: props.options.defaultValue,
      Form: props.form,
    });
  }
  if (shapeInherited) {
    return props.inheritedForm;
  }
  if (shapeAllowsAutomaticControls(props.options.shape)) {
    return wrapOptionsForm({
      shape: props.options.shape,
      defaultValue: props.options.defaultValue,
    });
  }
  throw new Error(
    `makeFrontend: ${JSON.stringify(props.moduleId)} ${props.breakpoint} options require a custom form; automatic controls require non-nullable booleans with boolean defaults`,
  );
}

function dataTypeOf(data: unknown) {
  if (data === null) return "null";
  if (data !== null && typeof data === "object" && "dataType" in data) {
    const dataType = data.dataType;
    if (dataType === "form" || dataType === "fetcher" || dataType === "static") return dataType;
  }
  return "static";
}
export function makeFrontend<
  MODULE extends {
    id: string;
    label: string;
    description: string;
    catalog?: Catalog;
    data: unknown;
    dataShape: IShape | null;
    defaultData: unknown;
    stateShape: IShape;
    defaultState: unknown;
    breakpoints: {
      sm: {
        w?: number;
        h?: number;
        defaultSpec?: Spec;
        options?: ReturnType<typeof makeBreakpointOptionShape>;
      };
      md: {
        w?: number;
        h?: number;
        defaultSpec?: Spec;
        options?: ReturnType<typeof makeBreakpointOptionShape>;
      };
      lg: {
        w?: number;
        h?: number;
        defaultSpec?: Spec;
        options?: ReturnType<typeof makeBreakpointOptionShape>;
      };
      xl: {
        w?: number;
        h?: number;
        defaultSpec?: Spec;
        options?: ReturnType<typeof makeBreakpointOptionShape>;
      };
    };
    def: {
      moduleId: string;
      sm: { w?: number; h?: number };
      md: { w?: number; h?: number };
      lg: { w?: number; h?: number };
      xl: { w?: number; h?: number };
      data: unknown;
    };
  },
>(
  module: MODULE,
  frontend: {
    component: {
      bivarianceHack(props: { data: unknown; breakpointOptions: unknown }): ReactNode;
    }["bivarianceHack"];
  } & (MODULE extends { catalog: Catalog }
    ? { registry: ComponentRegistry }
    : { registry?: never }) &
    (MODULE extends { data: { dataType: "form"; dataShape: infer DATA_SHAPE extends IShape } }
      ? {
          data: {
            form: (props: {
              data: InferDecodedRow<DATA_SHAPE>;
              onChange: (data: InferDecodedRow<DATA_SHAPE>) => void;
            }) => ReactNode;
          };
        }
      : MODULE extends {
            data: { dataType: "fetcher"; payloadShape: infer PAYLOAD_SHAPE extends IShape };
          }
        ? {
            data?: {
              payloadForm?: (props: {
                value: InferDecodedRow<PAYLOAD_SHAPE>;
                onChange: (value: InferDecodedRow<PAYLOAD_SHAPE>) => void;
              }) => ReactNode;
            };
          }
        : { data?: never }) & {
      breakpoints?: {
        sm?: {
          options?: {
            form: {
              bivarianceHack(props: {
                value: InferDecodedRow<IShape>;
                onChange: {
                  bivarianceHack(value: InferDecodedRow<IShape>): void;
                }["bivarianceHack"];
              }): ReactNode;
            }["bivarianceHack"];
          };
        };
        md?: {
          options?: {
            form: {
              bivarianceHack(props: {
                value: InferDecodedRow<IShape>;
                onChange: {
                  bivarianceHack(value: InferDecodedRow<IShape>): void;
                }["bivarianceHack"];
              }): ReactNode;
            }["bivarianceHack"];
          };
        };
        lg?: {
          options?: {
            form: {
              bivarianceHack(props: {
                value: InferDecodedRow<IShape>;
                onChange: {
                  bivarianceHack(value: InferDecodedRow<IShape>): void;
                }["bivarianceHack"];
              }): ReactNode;
            }["bivarianceHack"];
          };
        };
        xl?: {
          options?: {
            form: {
              bivarianceHack(props: {
                value: InferDecodedRow<IShape>;
                onChange: {
                  bivarianceHack(value: InferDecodedRow<IShape>): void;
                }["bivarianceHack"];
              }): ReactNode;
            }["bivarianceHack"];
          };
        };
      };
    },
) {
  const smForm = resolveOptionsForm({
    moduleId: module.id,
    breakpoint: "sm",
    options: module.breakpoints.sm.options,
    inheritedForm: undefined,
    inheritedOptions: undefined,
    form: frontend.breakpoints?.sm?.options?.form,
  });
  const mdForm = resolveOptionsForm({
    moduleId: module.id,
    breakpoint: "md",
    options: module.breakpoints.md.options,
    inheritedForm: smForm,
    inheritedOptions: module.breakpoints.sm.options,
    form: frontend.breakpoints?.md?.options?.form,
  });
  const lgForm = resolveOptionsForm({
    moduleId: module.id,
    breakpoint: "lg",
    options: module.breakpoints.lg.options,
    inheritedForm: mdForm,
    inheritedOptions: module.breakpoints.md.options,
    form: frontend.breakpoints?.lg?.options?.form,
  });
  const xlForm = resolveOptionsForm({
    moduleId: module.id,
    breakpoint: "xl",
    options: module.breakpoints.xl.options,
    inheritedForm: lgForm,
    inheritedOptions: module.breakpoints.lg.options,
    form: frontend.breakpoints?.xl?.options?.form,
  });

  const data =
    dataTypeOf(module.data) === "null"
      ? null
      : dataTypeOf(module.data) === "form"
        ? {
            ...(typeof module.data === "object" && module.data !== null ? module.data : {}),
            form: (
              frontend as {
                data: {
                  form: (props: { data: unknown; onChange: (data: unknown) => void }) => ReactNode;
                };
              }
            ).data.form,
          }
        : dataTypeOf(module.data) === "fetcher"
          ? {
              ...(typeof module.data === "object" && module.data !== null ? module.data : {}),
              payloadForm: (
                frontend as {
                  data?: {
                    payloadForm?: (props: {
                      value: Record<string, unknown>;
                      onChange: (value: Record<string, unknown>) => void;
                    }) => ReactNode;
                  };
                }
              ).data?.payloadForm,
            }
          : module.data;

  const registry = "registry" in frontend ? frontend.registry : undefined;
  if (module.catalog !== undefined && registry === undefined) {
    throw new Error(`makeFrontend: ${JSON.stringify(module.id)} has catalog and requires registry`);
  }
  if (module.catalog === undefined && registry !== undefined) {
    throw new Error(`makeFrontend: ${JSON.stringify(module.id)} has no catalog; omit registry`);
  }

  const Authored = frontend.component;

  function Brick(propsForBrick: {
    data?: unknown;
    breakpoint: "sm" | "md" | "lg" | "xl";
    breakpointOptions?: unknown;
    spec?: Spec;
  }) {
    const resolved = module.breakpoints[propsForBrick.breakpoint];
    const breakpointOptions =
      resolved.options === undefined
        ? (propsForBrick.breakpointOptions ?? {})
        : resolved.options.decode(propsForBrick.breakpointOptions);
    if (propsForBrick.spec !== undefined) {
      if (registry === undefined) {
        throw new Error(`makeFrontend: ${JSON.stringify(module.id)} Renderer requires registry`);
      }
      const initialState = mergeBrickState(propsForBrick.data, breakpointOptions);
      return (
        <BrickFrame>
          <StateProvider initialState={initialState}>
            <VisibilityProvider>
              <ActionProvider handlers={{}}>
                <Renderer spec={propsForBrick.spec} registry={registry} />
              </ActionProvider>
            </VisibilityProvider>
          </StateProvider>
        </BrickFrame>
      );
    }
    return (
      <BrickFrame>
        <Authored data={propsForBrick.data} breakpointOptions={breakpointOptions} />
      </BrickFrame>
    );
  }

  if (dataTypeOf(module.data) === "null") {
    return {
      ...module,
      data: null,
      dataShape: null,
      defaultData: null,
      stateShape: module.stateShape,
      defaultState: module.defaultState,
      ...(registry === undefined ? {} : { registry }),
      breakpoints: {
        sm: {
          ...module.breakpoints.sm,
          options: attachForm(module.breakpoints.sm.options, smForm),
        },
        md: {
          ...module.breakpoints.md,
          options: attachForm(module.breakpoints.md.options, mdForm),
        },
        lg: {
          ...module.breakpoints.lg,
          options: attachForm(module.breakpoints.lg.options, lgForm),
        },
        xl: {
          ...module.breakpoints.xl,
          options: attachForm(module.breakpoints.xl.options, xlForm),
        },
      },
      component: Brick,
    };
  }

  return {
    ...module,
    data,
    dataShape: module.dataShape,
    defaultData: module.defaultData,
    stateShape: module.stateShape,
    defaultState: module.defaultState,
    ...(registry === undefined ? {} : { registry }),
    breakpoints: {
      sm: { ...module.breakpoints.sm, options: attachForm(module.breakpoints.sm.options, smForm) },
      md: { ...module.breakpoints.md, options: attachForm(module.breakpoints.md.options, mdForm) },
      lg: { ...module.breakpoints.lg, options: attachForm(module.breakpoints.lg.options, lgForm) },
      xl: { ...module.breakpoints.xl, options: attachForm(module.breakpoints.xl.options, xlForm) },
    },
    component: Brick,
  };
}

function attachForm(
  options:
    | {
        shape: IShape;
        defaultValue: InferDecodedRow<IShape>;
        decode: (value: unknown) => unknown;
      }
    | undefined,
  form:
    | {
        bivarianceHack(props: {
          value: unknown;
          onChange: { bivarianceHack(value: unknown): void }["bivarianceHack"];
        }): ReactNode;
      }["bivarianceHack"]
    | undefined,
) {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...options,
    form,
  };
}
