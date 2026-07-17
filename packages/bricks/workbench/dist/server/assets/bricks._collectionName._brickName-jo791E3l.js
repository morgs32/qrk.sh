import { Link } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
//#region workbench/src/routes/bricks.$collectionName.$brickName.tsx?tsr-split=notFoundComponent
function BrickNotFound() {
	return /* @__PURE__ */ jsxs("main", {
		className: "mx-auto max-w-3xl p-6",
		"data-testid": "brick-not-found",
		children: [
			/* @__PURE__ */ jsx("h1", { children: "Brick not found" }),
			/* @__PURE__ */ jsx("p", { children: "The requested collection and brick name pair is not registered in the catalog." }),
			/* @__PURE__ */ jsx(Link, {
				to: "/",
				children: "Return to all collections"
			})
		]
	});
}
//#endregion
export { BrickNotFound as notFoundComponent };
