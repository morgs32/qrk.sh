import { createElement } from "react";
import type { RouteObject } from "react-router";
import { ZerospinRouteErrorBoundary } from "@zerospin/error-boundary/ZerospinRouteErrorBoundary";
import App from "./App";

export default [
  {
    hydrateFallbackElement: createElement("p", { role: "status" }, "Loading workspace…"),
    Component: App,
    ErrorBoundary: ZerospinRouteErrorBoundary,
    children: [
      {
        path: ":username",
        lazy: async () => {
          const { default: UserLayout } = await import("./[username]/UserLayout");
          return { Component: UserLayout };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { default: Dashboard } = await import("./[username]/Dashboard");
              return { Component: Dashboard };
            },
          },
          {
            path: "site/:siteId/page/:pageId",
            lazy: async () => {
              const { default: SiteLayout } = await import("./[username]/site/[siteId]/SiteLayout");
              return { Component: SiteLayout };
            },
            children: [
              {
                lazy: async () => {
                  const { default: EditorLayout } =
                    await import("./[username]/site/[siteId]/page/[pageId]/EditorLayout");
                  return { Component: EditorLayout };
                },
                children: [
                  {
                    index: true,
                    lazy: async () => {
                      const { default: PageRoute, handle } = await import("./routes/PageRoute");
                      return { Component: PageRoute, handle };
                    },
                  },
                  {
                    lazy: async () => {
                      const { default: LeftDrawerLayout, handle } =
                        await import("./routes/LeftDrawerLayout");
                      return { Component: LeftDrawerLayout, handle };
                    },
                    children: [
                      {
                        path: "brick-catalog",
                        lazy: async () => {
                          const { default: BrickCatalogsRoute, handle } =
                            await import("./routes/BrickCatalogsRoute");
                          return { Component: BrickCatalogsRoute, handle };
                        },
                      },
                      {
                        path: "brick-catalog/:catalogName",
                        lazy: async () => {
                          const { default: BrickCatalogRoute } =
                            await import("./routes/BrickCatalogRoute");
                          return { Component: BrickCatalogRoute };
                        },
                      },
                      {
                        path: "brick/:brickId",
                        lazy: async () => {
                          const { default: BrickDetailRoute, handle } =
                            await import("./routes/BrickDetailRoute");
                          return { Component: BrickDetailRoute, handle };
                        },
                      },
                    ],
                  },
                  {
                    lazy: async () => {
                      const { default: RightDrawerLayout, handle } =
                        await import("./routes/RightDrawerLayout");
                      return { Component: RightDrawerLayout, handle };
                    },
                    children: [
                      {
                        path: "compose",
                        lazy: async () => {
                          const { default: ComposeRoute, handle } =
                            await import("./routes/ComposeRoute");
                          return { Component: ComposeRoute, handle };
                        },
                      },
                    ],
                  },
                  {
                    lazy: async () => {
                      const { default: BottomDrawerLayout, handle } =
                        await import("./routes/BottomDrawerLayout");
                      return { Component: BottomDrawerLayout, handle };
                    },
                    children: [
                      {
                        path: "page-settings",
                        lazy: async () => {
                          const { default: PageSettingsRoute } =
                            await import("./routes/PageSettingsRoute");
                          return { Component: PageSettingsRoute };
                        },
                      },
                      {
                        path: "site-settings",
                        lazy: async () => {
                          const { default: SiteSettingsRoute } =
                            await import("./routes/SiteSettingsRoute");
                          return { Component: SiteSettingsRoute };
                        },
                      },
                      {
                        path: "breakpoints",
                        lazy: async () => {
                          const { default: BreakpointsRoute } =
                            await import("./routes/BreakpointsRoute");
                          return { Component: BreakpointsRoute };
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: "*",
        lazy: async () => {
          const { default: NotFound } = await import("./NotFound");
          return { Component: NotFound };
        },
      },
    ],
  },
] satisfies RouteObject[];
