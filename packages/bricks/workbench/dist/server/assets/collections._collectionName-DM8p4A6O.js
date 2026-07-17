import { n as collectionsHash } from "./src-CguBrpPp.js";
import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
//#region workbench/src/routes/collections.$collectionName.tsx
var $$splitNotFoundComponentImporter = () => import("./collections._collectionName-CvhKO8aP.js");
var $$splitComponentImporter = () => import("./collections._collectionName-DrW8S34t.js");
var Route = createFileRoute("/collections/$collectionName")({
	loader: ({ params }) => {
		const collection = Object.values(collectionsHash).find((candidate) => candidate.collectionName === params.collectionName);
		if (!collection) throw notFound();
		return collection.collectionName;
	},
	component: lazyRouteComponent($$splitComponentImporter, "component"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, "notFoundComponent")
});
//#endregion
export { Route as t };
