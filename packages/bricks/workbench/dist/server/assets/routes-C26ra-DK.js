import { n as collectionsHash } from "./src-CguBrpPp.js";
import { Link } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
//#region workbench/src/routes/index.tsx?tsr-split=component
function CatalogPage() {
	const collections = Object.values(collectionsHash);
	return /* @__PURE__ */ jsxs("main", {
		className: "mx-auto max-w-6xl p-6",
		children: [/* @__PURE__ */ jsxs("div", {
			className: "mb-8",
			children: [
				/* @__PURE__ */ jsx("p", {
					className: "mb-2 text-sm font-medium uppercase tracking-[0.18em] text-zinc-500",
					children: "Development sandbox"
				}),
				/* @__PURE__ */ jsx("h1", {
					className: "m-0 text-4xl font-semibold tracking-tight",
					children: "Brick collections"
				}),
				/* @__PURE__ */ jsx("p", {
					className: "mt-3 max-w-2xl text-zinc-600",
					children: "Open a collection, then use a brick's two-part catalog identity for a stable development URL."
				})
			]
		}), /* @__PURE__ */ jsx("div", {
			className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
			children: collections.map((collection) => /* @__PURE__ */ jsxs(Link, {
				to: "/collections/$collectionName",
				params: { collectionName: collection.collectionName },
				"data-collection-link": collection.collectionName,
				className: "rounded-xl border border-zinc-300 bg-white p-5 no-underline transition hover:border-zinc-500",
				children: [
					/* @__PURE__ */ jsx("h2", {
						className: "m-0 text-xl font-semibold",
						children: collection.collectionLabel
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mb-0 mt-2 font-mono text-sm text-zinc-500",
						children: collection.collectionName
					}),
					/* @__PURE__ */ jsxs("p", {
						className: "mb-0 mt-4 text-sm text-zinc-600",
						children: [Object.keys(collection.bricks).length, " variants"]
					})
				]
			}, collection.collectionName))
		})]
	});
}
//#endregion
export { CatalogPage as component };
