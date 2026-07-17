/**
 * Rebuild workspace package when API changes — do not adapt consumers to stale dist exports.
 *
 * @bad Import the removed ReactZerospinDevtools adapter because the DevTools dist directory is stale.
 */
import type { ComponentType } from "react";

import { ZerospinDevtools } from "@zerospin/devtools/ZerospinDevtools";

export const AppDevtools: ComponentType = ZerospinDevtools;

// Rebuild: nx run @zerospin/devtools:lib
