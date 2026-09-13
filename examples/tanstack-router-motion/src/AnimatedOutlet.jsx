import React from "react";
import { Outlet, useMatches, useMatch } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";

// Baseline from TanStack's example: key the live outlet by its next match.
export function AnimatedOutlet() {
  const matches = useMatches();
  const match = useMatch({ strict: false });
  const next = matches[matches.findIndex((m) => m.id === match.id) + 1];
  return (
    <AnimatePresence mode="wait">
      <Outlet key={next?.id} />
    </AnimatePresence>
  );
}
