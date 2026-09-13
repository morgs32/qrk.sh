import React from "react";
import { Links, Meta, Scripts } from "react-router";
import { Workspace } from "./Workspace";

export function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>React Router Framework + Motion</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <p>Loading workspace…</p>;
}

export default function App() {
  return <Workspace />;
}
