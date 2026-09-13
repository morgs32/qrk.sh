import React from "react";
import { Link, useMatches, useOutlet } from "react-router";
import { AnimatePresence } from "framer-motion";
export function Workspace() {
  const matches = useMatches();
  const group = matches.find((match) => match.handle?.drawer)?.handle.drawer;
  // Capture the framework-provided outlet element instead of mounting a live
  // Outlet inside the outgoing presence boundary.
  const content = useOutlet();

  return (
    <>
      <nav>
        {["/", "/catalog", "/brick/one", "/compose"].map((to) => (
          <Link key={to} to={to} style={{ margin: 12 }}>
            {to}
          </Link>
        ))}
      </nav>
      <div data-grid style={{ height: 250, overflow: "auto" }}>
        <input aria-label="draft" defaultValue="draft" />
        <div style={{ height: 2000 }}>Persistent grid</div>
      </div>
      <AnimatePresence mode="sync">
        {group && <React.Fragment key={group}>{content}</React.Fragment>}
      </AnimatePresence>
    </>
  );
}
