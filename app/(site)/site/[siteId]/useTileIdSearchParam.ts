"use client";

import { parseAsString, useQueryState } from "nuqs";

export function useTileIdSearchParam() {
  return useQueryState("tileId", parseAsString);
}
