/* oxlint-disable eslint-plugin-next(no-head-element) -- This is a TanStack Start document shell, not a Next.js page. */

import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";

import { Button } from "../../ui/button";
import sandboxCss from "../sandbox.css?url";
import { useGridStore } from "../useGridStore";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "QRK brick sandbox" },
    ],
    links: [{ rel: "stylesheet", href: sandboxCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="qrk-bricks min-h-screen">
      <header className="relative z-50 flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <Link to="/" className="sandbox-wordmark text-lg">
          QRK.SH SANDBOX
        </Link>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Reset grid layout"
          title="Reset grid layout"
          onClick={() => {
            useGridStore.setState({
              layout: [
                { i: "fixture-1", x: 0, y: 0, w: 2, h: 2 },
                { i: "fixture-2", x: 2, y: 0, w: 2, h: 2 },
                { i: "fixture-3", x: 4, y: 0, w: 2, h: 2 },
                { i: "fixture-4", x: 6, y: 0, w: 2, h: 2 },
              ],
              bricksById: {},
              activeBrickDrag: null,
            });
          }}
        >
          <RotateCcw aria-hidden />
        </Button>
      </header>
      <Outlet />
    </div>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
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
