import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route(":username", "[username]/UserLayout.tsx", [
    index("[username]/Dashboard.tsx"),
    route("site/:siteId/page/:pageId", "[username]/site/[siteId]/SiteLayout.tsx", [
      layout("[username]/site/[siteId]/page/[pageId]/EditorLayout.tsx", [
        index("routes/PageRoute.tsx"),
        layout("routes/LeftDrawerLayout.tsx", [
          route("brick-catalog", "routes/BrickCatalogRoute.tsx"),
          route("brick/:brickId", "routes/BrickDetailRoute.tsx"),
        ]),
        layout("routes/RightDrawerLayout.tsx", [route("compose", "routes/ComposeRoute.tsx")]),
        layout("routes/BottomDrawerLayout.tsx", [
          route("page-settings", "routes/PageSettingsRoute.tsx"),
          route("site-settings", "routes/SiteSettingsRoute.tsx"),
          route("breakpoints", "routes/BreakpointsRoute.tsx"),
        ]),
      ]),
    ]),
  ]),
  route("*", "NotFound.tsx"),
] satisfies RouteConfig;
