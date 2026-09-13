import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import routes from "./routes";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

const router = createBrowserRouter(routes);
createRoot(root).render(<RouterProvider router={router} />);
