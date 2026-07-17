/* oxlint-disable eslint-plugin-next(no-head-element) -- This is a TanStack Start document shell, not a Next.js page. */

import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

import sandboxCss from "../sandbox.css?url";

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
    <div className="min-h-screen">
      <header className="border-b border-zinc-300 bg-white px-6 py-4">
        <Link to="/" className="text-lg font-semibold no-underline">
          QRK brick sandbox
        </Link>
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
