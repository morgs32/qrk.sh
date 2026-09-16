import type { ReactNode } from "react";

import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import { TanStackRouteErrorBoundary } from "../TanStackRouteErrorBoundary";
import "../globals.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "QRK.SH Library" },
    ],
  }),
  component: RootComponent,
  errorComponent: TanStackRouteErrorBoundary,
  notFoundComponent: RootNotFound,
});

function RootNotFound() {
  return (
    <TanStackRouteErrorBoundary
      error={Object.assign(new Error("The requested page was not found."), { name: "NotFound" })}
    />
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <div className="qrk-bricks min-h-screen">
        <Outlet />
      </div>
    </RootDocument>
  );
}

function RootDocument(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
