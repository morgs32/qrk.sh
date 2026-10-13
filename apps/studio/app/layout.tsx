import "@qrk.sh/library/article-editor.css";
import { ZerospinDevtoolsLoader } from "@zerospin/react/ZerospinDevtoolsLoader";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import App from "./App";
import "./globals.css";

export const metadata: Metadata = { title: "QRK.SH", icons: { icon: "/assets/favicon.ico" } };

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <App>{children}</App>
        {process.env.NODE_ENV === "development" && <ZerospinDevtoolsLoader defaultOpen={false} />}
      </body>
    </html>
  );
}
