import { Outlet, ScrollRestoration } from "react-router";

import "./globals.css";

export default function RootLayout() {
  return (
    <div className="qrk-bricks typeset typeset-brick min-h-screen">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
