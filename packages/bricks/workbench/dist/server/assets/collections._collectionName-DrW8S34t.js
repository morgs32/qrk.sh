import { n as collectionsHash } from "./src-CguBrpPp.js";
import { t as Route } from "./collections._collectionName-DM8p4A6O.js";
import { Link, notFound } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
//#region workbench/src/routes/collections.$collectionName.tsx?tsr-split=component
function CollectionPage() {
	const collectionName = Route.useLoaderData();
	const collection = Object.values(collectionsHash).find((candidate) => candidate.collectionName === collectionName);
	if (!collection) throw notFound();
	const bricks = Object.values(collection.bricks);
	return /* @__PURE__ */ jsxs("main", {
		className: "mx-auto max-w-7xl p-6",
		children: [
			/* @__PURE__ */ jsx(Link, {
				to: "/",
				className: "text-sm text-zinc-600",
				children: "All collections"
			}),
			/* @__PURE__ */ jsx("h1", {
				className: "mb-1 mt-5 text-4xl font-semibold tracking-tight",
				children: collection.collectionLabel
			}),
			/* @__PURE__ */ jsx("p", {
				className: "mt-0 font-mono text-sm text-zinc-500",
				children: collection.collectionName
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mt-8 grid gap-6 xl:grid-cols-2",
				children: bricks.map((brick) => {
					const BrickComponent = brick.component;
					const previewUnitPx = 48;
					return /* @__PURE__ */ jsxs(Link, {
						to: "/bricks/$collectionName/$brickName",
						params: {
							collectionName: brick.def.collectionName,
							brickName: brick.def.name
						},
						"data-brick-link": `${brick.def.collectionName}/${brick.def.name}`,
						className: "rounded-xl border border-zinc-300 bg-white p-5 no-underline",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "mb-4 flex items-baseline justify-between gap-4",
							children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h2", {
								className: "m-0 text-lg font-semibold",
								children: brick.def.label
							}), /* @__PURE__ */ jsx("p", {
								className: "mb-0 mt-1 font-mono text-xs text-zinc-500",
								children: brick.def.name
							})] }), /* @__PURE__ */ jsxs("span", {
								className: "text-sm text-zinc-500",
								children: [
									brick.def.w,
									" × ",
									brick.def.h
								]
							})]
						}), /* @__PURE__ */ jsx("div", {
							className: "overflow-auto rounded-lg bg-zinc-100 p-4",
							children: /* @__PURE__ */ jsx("div", {
								className: "qrk-bricks overflow-hidden",
								style: {
									width: brick.def.w * previewUnitPx,
									height: brick.def.h * previewUnitPx
								},
								children: /* @__PURE__ */ jsx(BrickComponent, {})
							})
						})]
					}, brick.def.name);
				})
			})
		]
	});
}
//#endregion
export { CollectionPage as component };
