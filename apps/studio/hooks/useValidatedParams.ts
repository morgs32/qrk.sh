"use client";

import { useParams } from "next/navigation";

import { Schema } from "effect";

export function useValidatedParams<SCHEMA extends Schema.ConstraintDecoder<unknown>>(
  schema: SCHEMA,
): SCHEMA["Type"] {
  const params = useParams();
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: "ignore",
  });
}
