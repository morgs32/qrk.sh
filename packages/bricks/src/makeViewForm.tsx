import { makeEffectSchema, type InferDecodedRow, type IShape } from "@zerospin/schema";
import { Schema } from "effect";
import type { ReactNode } from "react";

/** View-only controls validate complete values without invoking a content fetcher. */
export function makeViewForm<const SHAPE extends IShape>(props: {
  shape: SHAPE;
  form: (props: {
    value: InferDecodedRow<SHAPE>;
    onChange: (value: InferDecodedRow<SHAPE>) => void;
  }) => ReactNode;
}) {
  const schema = Schema.toType(makeEffectSchema(props.shape));
  const defaults: Record<string, unknown> = {};
  for (const [name, descriptor] of Object.entries(props.shape)) {
    defaults[name] = "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
  }
  const defaultValue = Schema.decodeUnknownSync(schema)(defaults, { onExcessProperty: "error" });
  const Form = props.form;
  return {
    shape: props.shape,
    defaultValue,
    decode(value: unknown) {
      return Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
    },
    form({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
      return (
        <Form
          value={Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" })}
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
