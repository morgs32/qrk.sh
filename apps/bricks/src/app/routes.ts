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
              const { default: CatalogsPage } = await import("./routes/CatalogsPage");
              return { Component: CatalogsPage };
            },
          },
          {
            path: "catalogs/:catalogName",
            lazy: async () => {
              const {
                default: CatalogPage,
                loader,
                ErrorBoundary,
              } = await import("./routes/CatalogPage");
              return { Component: CatalogPage, loader, ErrorBoundary };
            },
            children: [
              {
                index: true,
                lazy: async () => {
                  const { default: RegistryConfiguration, ErrorBoundary } =
                    await import("./routes/RegistryConfiguration");
                  return { Component: RegistryConfiguration, ErrorBoundary };
                },
              },
              {
                path: ":registryName",
                lazy: async () => {
                  const {
                    default: RegistryConfiguration,
                    loader,
                    ErrorBoundary,
                  } = await import("./routes/RegistryConfiguration");
                  return {
                    Component: RegistryConfiguration,
                    loader,
                    ErrorBoundary,
                  };
                },
              },
              {
                path: "brick/:brickId",
                lazy: async () => {
                  const { default: BrickDetail } = await import("./routes/BrickDetail");
                  return { Component: BrickDetail };
                },
              },
            ],
          },
        ],
      },
      {
        path: "bricks/:catalogName/:registry",
        lazy: async () => {
          const { default: BrickPage, loader, ErrorBoundary } = await import("./routes/BrickPage");
          return { Component: BrickPage, loader, ErrorBoundary };
        },
      },
    ],
  },
] satisfies RouteObject[];
