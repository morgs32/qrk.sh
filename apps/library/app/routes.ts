import { ZerospinRouteErrorBoundary } from "@zerospin/error-boundary/ZerospinRouteErrorBoundary";
import type { RouteObject } from "react-router";

import RootLayout from "./RootLayout";
import SandboxLayout from "./routes/Layout";
import BrickPage, { loader as brickPageLoader } from "./routes/bricks/$moduleId/BrickPage";
import ModulesPage from "./routes/modules/ModulesPage";
import BrickDetail from "./routes/modules/$moduleId/$brickId/BrickDetail";
import ModuleDetail from "./routes/modules/$moduleId/ModuleDetail";
import ModulePage, { loader as modulePageLoader } from "./routes/modules/$moduleId/ModulePage";

export default [
  {
    Component: RootLayout,
    ErrorBoundary: ZerospinRouteErrorBoundary,
    children: [
      {
        Component: SandboxLayout,
        children: [
          {
            path: "modules",
            children: [
              {
                index: true,
                Component: ModulesPage,
              },
              {
                path: ":moduleId",
                Component: ModulePage,
                loader: modulePageLoader,
                children: [
                  {
                    index: true,
                    Component: ModuleDetail,
                  },
                  {
                    path: ":brickId",
                    Component: BrickDetail,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        path: "bricks/:moduleId",
        Component: BrickPage,
        loader: brickPageLoader,
      },
    ],
  },
] satisfies RouteObject[];
