"use client";

import { Schema } from "effect";
import { useParams } from "next/navigation";

export function useValidatedParams<SCHEMA extends Schema.ConstraintDecoder<unknown>>(
  schema: SCHEMA,
): SCHEMA["Type"] {
  const params = useParams();
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: "ignore",
  });
}
