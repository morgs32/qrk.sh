import {
  cloneLayout,
  cloneLayoutItem,
  correctBounds,
  getAllCollisions,
  verticalCompactor,
} from "react-grid-layout/core";
import type { Layout, LayoutItem } from "react-grid-layout";

const GRID_COLS = 8;

/**
 * Clone, bound, and displace visible neighbors around an inserted/shown item, then compact gaps.
 * Synchronously return a fresh array of fresh { i, x, y, w, h } objects without mutating inputs.
 */
export function makeCollisionResolvedLayout(props: {
  visibleLayout: Layout;
  incoming: LayoutItem;
}) {
  const { visibleLayout, incoming } = props;
  let working = cloneLayout(visibleLayout);
  const existingIndex = working.findIndex((item) => item.i === incoming.i);
  const incomingItem = cloneLayoutItem(incoming);
  if (existingIndex === -1) {
    working.push(incomingItem);
  } else {
    working[existingIndex] = incomingItem;
  }
  working = correctBounds(working, { cols: GRID_COLS });

  const settled = working.filter((item) => item.i === incoming.i);
  const neighbors = working
    .filter((item) => item.i !== incoming.i)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const neighbor of neighbors) {
    let collisions = getAllCollisions(settled, neighbor);
    for (let safety = 0; safety < settled.length && collisions.length > 0; safety += 1) {
      neighbor.y = Math.max(...collisions.map((collision) => collision.y + collision.h));
      collisions = getAllCollisions(settled, neighbor);
    }
    settled.push(neighbor);
  }

  return makeCompactLayout(working);
}

/** Return an error message when a visible layout has overlaps or out-of-bounds items. */
export function findVisibleLayoutError(props: { layout: Layout; context: string }): string | null {
  const { layout, context } = props;
  const bounded = correctBounds(cloneLayout(layout), { cols: GRID_COLS });
  const seen = new Set<string>();
  for (const item of bounded) {
    if (seen.has(item.i)) {
      return `${context}: duplicate layout item ${item.i}`;
    }
    seen.add(item.i);
    if (item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1 || item.x + item.w > GRID_COLS) {
      return `${context}: layout item ${item.i} is out of bounds`;
    }
    const collisions = getAllCollisions(bounded, item);
    if (collisions.length > 0) {
      return `${context}: layout item ${item.i} overlaps ${collisions
        .map((collision) => collision.i)
        .join(", ")}`;
    }
  }
  return null;
}

/**
 * Vertically compact visible placements only.
 * Synchronously return a fresh array of fresh { i, x, y, w, h } objects without mutating inputs.
 */
export function makeCompactLayout(layout: Layout) {
  const compacted = verticalCompactor.compact(cloneLayout(layout), GRID_COLS);
  return compacted.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
}

export { GRID_COLS, cloneLayout, cloneLayoutItem, correctBounds };
