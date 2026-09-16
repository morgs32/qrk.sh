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
            path: "modules",
            children: [
              {
                index: true,
                lazy: async () => {
                  const { default: ModulesPage } = await import("./routes/modules/ModulesPage");
                  return { Component: ModulesPage };
                }},
              {
                path: ":moduleId",
                lazy: async () => {
                  const {
                    default: ModulePage,
                    loader,
                    ErrorBoundary} = await import("./routes/modules/ModulePage");
                  return { Component: ModulePage, loader, ErrorBoundary };
                },
                children: [
                  {
                    index: true,
                    lazy: async () => {
                      const { default: ModuleDetail, ErrorBoundary } =
                        await import("./routes/modules/ModuleDetail");
                      return { Component: ModuleDetail, ErrorBoundary };
                    }},
                  {
                    path: "bricks/:brickId",
                    lazy: async () => {
                      const { default: BrickDetail } =
                        await import("./routes/modules/bricks/BrickDetail");
                      return { Component: BrickDetail };
                    }},
                ]},
            ]},
        ]},
      {
        path: "bricks/:moduleId",
        lazy: async () => {
          const { default: BrickPage, loader, ErrorBoundary } =
            await import("./routes/bricks/BrickPage");
          return { Component: BrickPage, loader, ErrorBoundary };
        }},
    ]},
] satisfies RouteObject[];
