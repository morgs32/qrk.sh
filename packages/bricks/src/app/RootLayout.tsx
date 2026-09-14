import { Link, Outlet, ScrollRestoration } from "react-router";
import { RotateCcw } from "lucide-react";

import { Button } from "../ui/button";
import "./sandbox.css";
import { useGridStore } from "./useGridStore";

export default function RootLayout() {
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
              dataByBrickId: {},
              activeBrickDrag: null,
            });
          }}
        >
          <RotateCcw aria-hidden />
        </Button>
      </header>
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
