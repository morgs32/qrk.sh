import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
} from "@tanstack/react-router";
import { AnimatedOutlet } from "./AnimatedOutlet";
import { Shell } from "./Shell";
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
      <AnimatedOutlet />
    </>
  ),
});
const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
const left = createRoute({
  getParentRoute: () => root,
  id: "left",
  component: () => <Shell side="left" />,
});
const catalog = createRoute({
  getParentRoute: () => left,
  path: "catalog",
  component: () => <h1>Catalog</h1>,
});
const detail = createRoute({
  getParentRoute: () => left,
  path: "brick/$brickId",
  component: () => {
    const { brickId } = detail.useParams();
    return <h1>Brick {brickId}</h1>;
  },
});
const compose = createRoute({
  getParentRoute: () => root,
  path: "compose",
  component: () => <Shell side="right" />,
});
const router = createRouter({
  routeTree: root.addChildren([home, left.addChildren([catalog, detail]), compose]),
});
createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
