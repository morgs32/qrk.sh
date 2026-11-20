"use client";

import { useParams } from "@tanstack/react-router";

import * as Schema from "effect/Schema";

export function useValidatedParams<SCHEMA extends Schema.ConstraintDecoder<unknown>>(
  schema: SCHEMA,
): SCHEMA["Type"] {
  const params = useParams({ strict: false });
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: "ignore",
  });
}
