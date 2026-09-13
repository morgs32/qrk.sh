import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/SandboxLayout.tsx", [
    index("routes/CatalogPage.tsx"),
    route("collections/:collectionName", "routes/CollectionPage.tsx", [
      index("routes/CollectionCatalog.tsx"),
      route(":variantName", "routes/VariantConfiguration.tsx"),
      route("brick/:brickId", "routes/BrickDetail.tsx"),
    ]),
  ]),
  route("bricks/:collectionName/:variant/:size", "routes/BrickPage.tsx"),
] satisfies RouteConfig;
