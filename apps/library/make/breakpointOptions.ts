import { makeEffectSchema, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

/** Defaults and decode for one breakpoint option shape. Shared code is React-free. */
export function makeBreakpointOptionShape<const SHAPE extends IShape>(shape: SHAPE) {
  const schema = Schema.toType(makeEffectSchema(shape));
  const defaults: Record<string, unknown> = {};
  for (const [name, descriptor] of Object.entries(shape)) {
    defaults[name] = "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
  }
  const defaultValue = Schema.decodeUnknownSync(schema)(defaults, {
    onExcessProperty: "error",
  });

  return {
    shape,
    defaultValue,
    decode(value: unknown) {
      const picked: Record<string, unknown> = { ...defaultValue };
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        for (const name of Object.keys(shape)) {
          if (name in value) {
            picked[name] = value[name as keyof typeof value];
          }
        }
      }
      return Schema.decodeUnknownSync(schema)(picked, {
        onExcessProperty: "error",
      });
    },
  };
}
