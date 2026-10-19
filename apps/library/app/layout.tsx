import { HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ZerospinDevtoolsLoader } from "@zerospin/react/ZerospinDevtoolsLoader";

import "./globals.css";

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="qrk-bricks min-h-screen">{children}</div>
        <ZerospinDevtoolsLoader defaultOpen={false} />
        <Scripts />
      </body>
    </html>
  );
}
