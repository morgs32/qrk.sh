"use client";

import { Schema } from "effect";
import { useParams } from "next/navigation";

// oxlint-disable-next-line typescript/no-explicit-any
export function useValidatedParams<SCHEMA extends Schema.Schema<any, any>>(
  schema: SCHEMA,
): Schema.Schema.Type<SCHEMA> {
  const params = useParams();
  return Schema.decodeUnknownSync(schema)(params, {
    onExcessProperty: "ignore",
  });
}
