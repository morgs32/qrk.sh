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
              const { default: GroupsPage } = await import("./routes/GroupsPage");
              return { Component: GroupsPage };
            },
          },
          {
            path: "groups/:groupName",
            lazy: async () => {
              const {
                default: GroupPage,
                loader,
                ErrorBoundary,
              } = await import("./routes/GroupPage");
              return { Component: GroupPage, loader, ErrorBoundary };
            },
            children: [
              {
                index: true,
                lazy: async () => {
                  const { default: CatalogConfiguration, ErrorBoundary } =
                    await import("./routes/CatalogConfiguration");
                  return { Component: CatalogConfiguration, ErrorBoundary };
                },
              },
              {
                path: ":catalogName",
                lazy: async () => {
                  const {
                    default: CatalogConfiguration,
                    loader,
                    ErrorBoundary,
                  } = await import("./routes/CatalogConfiguration");
                  return {
                    Component: CatalogConfiguration,
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
        path: "bricks/:groupName/:catalog",
        lazy: async () => {
          const { default: BrickPage, loader, ErrorBoundary } = await import("./routes/BrickPage");
          return { Component: BrickPage, loader, ErrorBoundary };
        },
      },
    ],
  },
] satisfies RouteObject[];
