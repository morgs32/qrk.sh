import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { LibraryLayout } from "./LibraryLayout";
import "./globals.css";

export const metadata: Metadata = { title: "QRK.SH Library" };

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <body>
        <div className="qrk-bricks min-h-screen">
          <Suspense fallback={null}>
            <LibraryLayout>{children}</LibraryLayout>
          </Suspense>
        </div>
      </body>
    </html>
  );
}
