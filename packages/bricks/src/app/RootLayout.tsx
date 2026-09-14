import { Link, Outlet, ScrollRestoration } from "react-router";
import { RotateCcw } from "lucide-react";

import { Button } from "../ui/button";
import "./sandbox.css";
import { useGridStore } from "./useGridStore";

export default function RootLayout() {
  const mode = useGridStore((state) => state.mode);
  return (
    <div className="qrk-bricks min-h-screen">
      <header className="relative z-50 flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <Link to="/" className="sandbox-wordmark text-lg">
          QRK.SH SANDBOX
        </Link>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Grid mode"
            className="flex gap-2"
          >
            <Button
              type="button"
              aria-pressed={mode === "inspect"}
              variant={mode === "inspect" ? "default" : "outline"}
              onClick={() => useGridStore.setState({ mode: "inspect" })}
            >
              Inspect
            </Button>
            <Button
              type="button"
              aria-pressed={mode === "arrange"}
              variant={mode === "arrange" ? "default" : "outline"}
              onClick={() => useGridStore.setState({ mode: "arrange" })}
            >
              Arrange
            </Button>
          </div>
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
                activeBrickDrag: null,
              });
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
        </div>
      </header>
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}
