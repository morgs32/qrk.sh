import { createElement } from "react";

import { ZerospinRouteErrorBoundary } from "@zerospin/error-boundary/ZerospinRouteErrorBoundary";
import type { RouteObject } from "react-router";

import RootLayout from "./RootLayout";

export default [
  {
    hydrateFallbackElement: createElement("p", { role: "status" }, "Loading sandbox…"),
    Component: RootLayout,
    ErrorBoundary: ZerospinRouteErrorBoundary,
    children: [
      {
        lazy: async () => {
          const { default: SandboxLayout } = await import("./routes/SandboxLayout");
          return { Component: SandboxLayout };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { default: ModulesPage } = await import("./routes/ModulesPage");
              return { Component: ModulesPage };
            }},
          {
            path: "modules/:moduleId",
            lazy: async () => {
              const {
                default: ModulePage,
                loader,
                ErrorBoundary} = await import("./routes/ModulePage");
              return { Component: ModulePage, loader, ErrorBoundary };
            },
            children: [
              {
                index: true,
                lazy: async () => {
                  const { default: ModuleConfiguration, ErrorBoundary } =
                    await import("./routes/ModuleConfiguration");
                  return { Component: ModuleConfiguration, ErrorBoundary };
                }},
              {
                path: "brick/:brickId",
                lazy: async () => {
                  const { default: BrickDetail } = await import("./routes/BrickDetail");
                  return { Component: BrickDetail };
                }},
            ]},
        ]},
      {
        path: "bricks/:moduleId",
        lazy: async () => {
          const { default: BrickPage, loader, ErrorBoundary } = await import("./routes/BrickPage");
          return { Component: BrickPage, loader, ErrorBoundary };
        }},
    ]},
] satisfies RouteObject[];
