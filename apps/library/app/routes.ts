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
          const { default: SandboxLayout } = await import("./routes/Layout");
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
                },
              },
              {
                path: ":moduleId",
                lazy: async () => {
                  const { default: ModulePage, loader } =
                    await import("./routes/modules/$moduleId/ModulePage");
                  return { Component: ModulePage, loader };
                },
                children: [
                  {
                    index: true,
                    lazy: async () => {
                      const { default: ModuleDetail } =
                        await import("./routes/modules/$moduleId/ModuleDetail");
                      return { Component: ModuleDetail };
                    },
                  },
                  {
                    path: ":brickId",
                    lazy: async () => {
                      const { default: BrickDetail } =
                        await import("./routes/modules/$moduleId/$brickId/BrickDetail");
                      return { Component: BrickDetail };
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: "bricks/:moduleId",
        lazy: async () => {
          const { default: BrickPage, loader } =
            await import("./routes/bricks/$moduleId/BrickPage");
          return { Component: BrickPage, loader };
        },
      },
    ],
  },
] satisfies RouteObject[];
