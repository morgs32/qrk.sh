import { Link } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
//#region workbench/src/routes/collections.$collectionName.tsx?tsr-split=notFoundComponent
function CollectionNotFound() {
	return /* @__PURE__ */ jsxs("main", {
		className: "mx-auto max-w-3xl p-6",
		"data-testid": "collection-not-found",
		children: [
			/* @__PURE__ */ jsx("h1", { children: "Collection not found" }),
			/* @__PURE__ */ jsx("p", { children: "The requested collection name is not registered in the brick catalog." }),
			/* @__PURE__ */ jsx(Link, {
				to: "/",
				children: "Return to all collections"
			})
		]
	});
}
//#endregion
export { CollectionNotFound as notFoundComponent };
