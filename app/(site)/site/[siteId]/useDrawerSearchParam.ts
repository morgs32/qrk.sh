"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

const DRAWER_SEARCH_VALUES = ["edit-tiles", "edit-text"] as const;

export type IDrawerSearchValue = (typeof DRAWER_SEARCH_VALUES)[number];

const drawerSearchParser = parseAsStringLiteral(DRAWER_SEARCH_VALUES);

export function useDrawerSearchParam() {
  return useQueryState("drawer", drawerSearchParser);
}
