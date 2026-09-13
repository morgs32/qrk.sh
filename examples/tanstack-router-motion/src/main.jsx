import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Link,
} from "@tanstack/react-router";
import { Drawers } from "./Drawers";
window.events = [];
const root = createRootRoute({
  component: () => (
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
      <Drawers
        leftRouteId={left.id}
        catalogRouteId={catalog.id}
        detailRouteId={detail.id}
        composeRouteId={compose.id}
      />
    </>
  ),
});
const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
const left = createRoute({
  getParentRoute: () => root,
  id: "left",
});
const catalog = createRoute({
  getParentRoute: () => left,
  path: "catalog",
});
const detail = createRoute({
  getParentRoute: () => left,
  path: "brick/$brickId",
});
const compose = createRoute({
  getParentRoute: () => root,
  path: "compose",
});
const router = createRouter({
  routeTree: root.addChildren([home, left.addChildren([catalog, detail]), compose]),
});
createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
