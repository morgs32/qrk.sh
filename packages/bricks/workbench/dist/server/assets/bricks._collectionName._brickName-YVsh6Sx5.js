import { t as findCollectionBrick } from "./src-CguBrpPp.js";
import { t as Route } from "./bricks._collectionName._brickName-7iRwbaWa.js";
import { useState } from "react";
import { Link, notFound } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
//#region workbench/src/routes/bricks.$collectionName.$brickName.tsx?tsr-split=component
function BrickPage() {
	const brick = findCollectionBrick(Route.useLoaderData());
	if (!brick) throw notFound();
	const [gridUnitPx, setGridUnitPx] = useState(80);
	const [isDark, setIsDark] = useState(false);
	const BrickComponent = brick.component;
	return /* @__PURE__ */ jsxs("main", {
		className: "mx-auto max-w-7xl p-6",
		children: [/* @__PURE__ */ jsxs(Link, {
			to: "/collections/$collectionName",
			params: { collectionName: brick.def.collectionName },
			className: "text-sm text-zinc-600",
			children: ["Back to ", brick.def.collectionLabel]
		}), /* @__PURE__ */ jsxs("div", {
			className: "mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]",
			children: [/* @__PURE__ */ jsx("section", {
				className: isDark ? "qrk-bricks dark rounded-xl bg-zinc-950 p-6" : "qrk-bricks rounded-xl bg-white p-6",
				"data-testid": "brick-canvas",
				"data-canvas-theme": isDark ? "dark" : "light",
				children: /* @__PURE__ */ jsx("div", {
					className: "overflow-auto",
					children: /* @__PURE__ */ jsx("div", {
						className: "overflow-hidden",
						"data-testid": "brick-preview",
						style: {
							width: brick.def.w * gridUnitPx,
							height: brick.def.h * gridUnitPx
						},
						children: /* @__PURE__ */ jsx(BrickComponent, {})
					})
				})
			}), /* @__PURE__ */ jsxs("aside", {
				className: "rounded-xl border border-zinc-300 bg-white p-5",
				children: [
					/* @__PURE__ */ jsx("p", {
						className: "mb-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500",
						children: "Brick variant"
					}),
					/* @__PURE__ */ jsx("h1", {
						className: "m-0 text-2xl font-semibold",
						children: brick.def.label
					}),
					/* @__PURE__ */ jsxs("dl", {
						className: "grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm",
						children: [
							/* @__PURE__ */ jsx("dt", {
								className: "text-zinc-500",
								children: "Collection"
							}),
							/* @__PURE__ */ jsx("dd", {
								className: "m-0 font-mono",
								children: brick.def.collectionName
							}),
							/* @__PURE__ */ jsx("dt", {
								className: "text-zinc-500",
								children: "Brick"
							}),
							/* @__PURE__ */ jsx("dd", {
								className: "m-0 font-mono",
								children: brick.def.name
							}),
							/* @__PURE__ */ jsx("dt", {
								className: "text-zinc-500",
								children: "Width"
							}),
							/* @__PURE__ */ jsx("dd", {
								className: "m-0",
								children: brick.def.w
							}),
							/* @__PURE__ */ jsx("dt", {
								className: "text-zinc-500",
								children: "Height"
							}),
							/* @__PURE__ */ jsx("dd", {
								className: "m-0",
								children: brick.def.h
							})
						]
					}),
					/* @__PURE__ */ jsxs("label", {
						className: "mt-6 block text-sm font-medium",
						htmlFor: "grid-unit",
						children: ["Grid unit: ", /* @__PURE__ */ jsxs("output", { children: [gridUnitPx, "px"] })]
					}),
					/* @__PURE__ */ jsx("input", {
						id: "grid-unit",
						className: "mt-2 w-full",
						type: "range",
						min: "40",
						max: "160",
						value: gridUnitPx,
						onChange: (event) => setGridUnitPx(event.currentTarget.valueAsNumber)
					}),
					/* @__PURE__ */ jsxs("button", {
						type: "button",
						className: "mt-5 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium",
						onClick: () => setIsDark((current) => !current),
						children: [
							"Use ",
							isDark ? "light" : "dark",
							" canvas"
						]
					})
				]
			})]
		})]
	});
}
//#endregion
export { BrickPage as component };
