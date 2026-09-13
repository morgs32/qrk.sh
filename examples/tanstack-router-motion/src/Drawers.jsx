import React from "react";
import { useMatches } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { Shell } from "./Shell";

export function Drawers({ leftRouteId, catalogRouteId, detailRouteId, composeRouteId }) {
  const matches = useMatches();
  const leaf = matches[matches.length - 1];
  let drawer = null;

  // Resolve content while this route is active. The exiting shell keeps these
  // children instead of reading a live Outlet that follows the next route.
  if (matches.some((match) => match.routeId === leftRouteId)) {
    let content = null;
    if (leaf.routeId === catalogRouteId) {
      content = <h1>Catalog</h1>;
    } else if (leaf.routeId === detailRouteId) {
      content = <h1>Brick {leaf.params.brickId}</h1>;
    }
    drawer = (
      <Shell key="left" side="left">
        {content}
      </Shell>
    );
  } else if (leaf.routeId === composeRouteId) {
    drawer = (
      <Shell key="right" side="right">
        <h1>Compose</h1>
      </Shell>
    );
  }

  // Side-based keys preserve the shell between catalog and detail. Keeping
  // presence here lets an outgoing side finish while the incoming side enters.
  return <AnimatePresence mode="sync">{drawer}</AnimatePresence>;
}
