import "../modules/article/article-editor.css";
import { HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
