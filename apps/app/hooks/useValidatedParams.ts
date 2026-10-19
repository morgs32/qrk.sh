"use client";

import { useParams } from "@tanstack/react-router";

import { Schema } from "effect";

export function useValidatedParams<SCHEMA extends Schema.ConstraintDecoder<unknown>>(
  schema: SCHEMA,
): SCHEMA["Type"] {
  const params = useParams({ strict: false });
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: "ignore",
  });
}
