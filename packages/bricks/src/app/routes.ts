import { createElement } from "react";
import type { RouteObject } from "react-router";
import RootLayout from "./RootLayout";

export default [
  {
    hydrateFallbackElement: createElement("p", { role: "status" }, "Loading sandbox…"),
    Component: RootLayout,
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
              const { default: CatalogPage } = await import("./routes/CatalogPage");
              return { Component: CatalogPage };
            },
          },
          {
            path: "collections/:collectionName",
            lazy: async () => {
              const {
                default: CollectionPage,
                loader,
                ErrorBoundary,
              } = await import("./routes/CollectionPage");
              return { Component: CollectionPage, loader, ErrorBoundary };
            },
            children: [
              {
                index: true,
                lazy: async () => {
                  const { default: VariantConfiguration, ErrorBoundary } =
                    await import("./routes/VariantConfiguration");
                  return { Component: VariantConfiguration, ErrorBoundary };
                },
              },
              {
                path: ":variantName",
                lazy: async () => {
                  const {
                    default: VariantConfiguration,
                    loader,
                    ErrorBoundary,
                  } = await import("./routes/VariantConfiguration");
                  return { Component: VariantConfiguration, loader, ErrorBoundary };
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
        path: "bricks/:collectionName/:variant/:size",
        lazy: async () => {
          const { default: BrickPage, loader, ErrorBoundary } = await import("./routes/BrickPage");
          return { Component: BrickPage, loader, ErrorBoundary };
        },
      },
    ],
  },
] satisfies RouteObject[];
