import { SystemDiagrams } from "@zerospin/system-diagrams";
import { createRoot } from "react-dom/client";
import "@zerospin/system-diagrams/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("QRK Admin root element is missing");
}

createRoot(root).render(<SystemDiagrams systemSpec={__QRK_SYSTEM_SPEC__} />);
