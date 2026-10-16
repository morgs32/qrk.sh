"use client";

import { createContext } from "react";

/**
 * Local card appearance shared by a host's wall and drawer previews.
 *
 * (1) false: touching bricks with one opaque, overlapping shared border.
 * (2) true: native 16px grid gaps and perimeter padding around card surfaces.
 * (3) Hosts supply a local boolean; no Site/Page state is persisted.
 *
 * See wiki/research/page-brick-card-styling.md for geometry and spike limits.
 */
export const BrickCardStyleContext = createContext(false);
