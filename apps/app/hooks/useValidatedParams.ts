"use client";

import { Schema } from "effect";
import { useParams } from "react-router";

export function useValidatedParams<SCHEMA extends Schema.ConstraintDecoder<unknown>>(
  schema: SCHEMA,
): SCHEMA["Type"] {
  const params = useParams();
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: "ignore",
  });
}
