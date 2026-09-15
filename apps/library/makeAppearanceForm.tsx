import type { ReactNode } from "react";

import {
  makeEffectSchema,
  PrimitiveKind,
  type InferDecodedRow,
  type IShape,
} from "@zerospin/schema";
import { Schema } from "effect";

import { Switch } from "./components/ui/switch";

/** View-only controls validate complete values without invoking a content fetcher. */
export function makeAppearanceForm<const SHAPE extends IShape>(props: {
  shape: SHAPE;
  form?: (props: {
    value: InferDecodedRow<SHAPE>;
    onChange: (value: InferDecodedRow<SHAPE>) => void;
  }) => ReactNode;
}) {
  const schema = Schema.toType(makeEffectSchema(props.shape));
  const defaults: Record<string, unknown> = {};
  for (const [name, descriptor] of Object.entries(props.shape)) {
    if (
      props.form === undefined &&
      (descriptor.kind !== PrimitiveKind.Boolean ||
        descriptor.nullable !== false ||
        !("defaultValue" in descriptor) ||
        typeof descriptor.defaultValue !== "boolean")
    ) {
      throw new Error(
        `makeAppearanceForm: ${name} requires a custom form; automatic controls require non-nullable booleans with boolean defaults`,
      );
    }
    defaults[name] = "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
  }
  const defaultValue = Schema.decodeUnknownSync(schema)(defaults, {
    onExcessProperty: "error",
  });
  const Form = props.form;
  return {
    shape: props.shape,
    defaultValue,
    decode(value: unknown) {
      const withDefaults =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? { ...defaultValue, ...value }
          : value;
      return Schema.decodeUnknownSync(schema)(withDefaults, {
        onExcessProperty: "error",
      });
    },
    form({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
      const withDefaults =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? { ...defaultValue, ...value }
          : value;
      const decodedValue = Schema.decodeUnknownSync(schema)(withDefaults, {
        onExcessProperty: "error",
      });
      if (Form === undefined) {
        return (
          <div className="space-y-3 px-4 py-5">
            {Object.keys(props.shape).map((name) => {
              const words = name
                .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                .replace(/[_-]+/g, " ")
                .toLowerCase();
              const label = words.charAt(0).toUpperCase() + words.slice(1);
              return (
                <label key={name} className="flex items-center gap-3 text-sm">
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
    },
  };
}
