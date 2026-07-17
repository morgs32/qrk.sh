import { t as Route$2 } from "./collections._collectionName-DM8p4A6O.js";
import { t as Route$3 } from "./bricks._collectionName._brickName-7iRwbaWa.js";
import { HeadContent, Link, Outlet, Scripts, createFileRoute, createRootRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { jsx, jsxs } from "react/jsx-runtime";
//#region workbench/src/sandbox.css?url
var sandbox_default = "/assets/sandbox-CjJhc1tj.css";
//#endregion
//#region workbench/src/routes/__root.tsx
var Route$1 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "QRK brick sandbox" }
		],
		links: [{
			rel: "stylesheet",
			href: sandbox_default
		}]
	}),
	shellComponent: RootDocument,
	component: RootLayout
});
function RootLayout() {
	return /* @__PURE__ */ jsxs("div", {
		className: "min-h-screen",
		children: [/* @__PURE__ */ jsx("header", {
			className: "border-b border-zinc-300 bg-white px-6 py-4",
			children: /* @__PURE__ */ jsx(Link, {
				to: "/",
				className: "text-lg font-semibold no-underline",
				children: "QRK brick sandbox"
			})
		}), /* @__PURE__ */ jsx(Outlet, {})]
	});
}
function RootDocument({ children }) {
	return /* @__PURE__ */ jsxs("html", {
		lang: "en",
		children: [/* @__PURE__ */ jsx("head", { children: /* @__PURE__ */ jsx(HeadContent, {}) }), /* @__PURE__ */ jsxs("body", { children: [children, /* @__PURE__ */ jsx(Scripts, {})] })]
	});
}
//#endregion
//#region workbench/src/routes/index.tsx
var $$splitComponentImporter = () => import("./routes-C26ra-DK.js");
//#endregion
//#region workbench/src/routeTree.gen.ts
var rootRouteChildren = {
	IndexRoute: createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter, "component") }).update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$1
	}),
	CollectionsCollectionNameRoute: Route$2.update({
		id: "/collections/$collectionName",
		path: "/collections/$collectionName",
		getParentRoute: () => Route$1
	}),
	BricksCollectionNameBrickNameRoute: Route$3.update({
		id: "/bricks/$collectionName/$brickName",
		path: "/bricks/$collectionName/$brickName",
		getParentRoute: () => Route$1
	})
};
var routeTree = Route$1._addFileChildren(rootRouteChildren)._addFileTypes();
//#endregion
//#region workbench/src/router.tsx
function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0
	});
}
//#endregion
export { getRouter };
