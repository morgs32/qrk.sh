import { SystemDiagrams } from "@zerospin/system-diagrams";
import { createRoot } from "react-dom/client";
import "@zerospin/system-diagrams/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("QRK Admin root element is missing");
}

const route = /^\/(aggregates|services)\/([^/]+)$/.exec(window.location.pathname);
let sectionId: string | undefined;
if (route) {
  sectionId = `system-board-${route[1] === "aggregates" ? "aggregate" : "service"}-${route[2]}`;
} else if (window.location.pathname === "/") {
  const aggregateName = Object.keys(__QRK_SYSTEM_SPEC__.aggregates).sort()[0];
  const serviceName = Object.keys(__QRK_SYSTEM_SPEC__.services).sort()[0];
  if (aggregateName !== undefined) {
    sectionId = `system-board-aggregate-${encodeURIComponent(aggregateName)}`;
  } else if (serviceName !== undefined) {
    sectionId = `system-board-service-${encodeURIComponent(serviceName)}`;
  }
}

createRoot(root).render(
  <SystemDiagrams systemSpec={__QRK_SYSTEM_SPEC__} navigation={{ sectionId, basePath: "" }} />,
);
