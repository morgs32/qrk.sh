import { Outlet, ScrollRestoration } from "react-router";

import "./sandbox.css";

export default function RootLayout() {
  return (
    <div className="qrk-bricks min-h-screen">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
