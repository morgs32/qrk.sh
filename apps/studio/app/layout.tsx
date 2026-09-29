import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import App from "./App";
import "./globals.css";
import "./LoadingWorkspace/LoadingWorkspace.css";
import "./tiptap/styles/_variables.scss";
import "./tiptap/styles/_keyframe-animations.scss";

const spaceMono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff2",
      weight: "700",
    },
  ],
  variable: "--font-space-mono",
  display: "swap",
});
const silkscreen = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../node_modules/@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2",
      weight: "700",
    },
  ],
  variable: "--font-silkscreen",
  display: "swap",
});

export const metadata: Metadata = { title: "QRK.SH", icons: { icon: "/assets/favicon.ico" } };

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} ${silkscreen.variable} font-sans antialiased`}>
        <App>{children}</App>
      </body>
    </html>
  );
}
