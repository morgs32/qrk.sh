import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";

import LibraryError from "../app/error";
import RootLayout from "../app/layout";
import { LibraryLayout } from "../app/LibraryLayout";
import NotFound from "../app/not-found";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "QRK.SH Library" },
    ],
  }),
  shellComponent: RootLayout,
  component: () => (
    <Suspense fallback={null}>
      <LibraryLayout>
        <Outlet />
      </LibraryLayout>
    </Suspense>
  ),
  errorComponent: LibraryError,
  notFoundComponent: NotFound,
});
