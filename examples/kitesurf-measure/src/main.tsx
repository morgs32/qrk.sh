import { createRoot } from "react-dom/client";

import { ComparePage } from "./ComparePage";
import { RenderPage } from "./RenderPage";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing #root element.");
}

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const page = path === "/render" ? <RenderPage /> : <ComparePage />;

createRoot(rootElement).render(page);
