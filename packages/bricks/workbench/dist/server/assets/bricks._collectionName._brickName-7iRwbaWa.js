import { n as collectionsHash } from "./src-CguBrpPp.js";
import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
//#region workbench/src/routes/bricks.$collectionName.$brickName.tsx
var $$splitNotFoundComponentImporter = () => import("./bricks._collectionName._brickName-jo791E3l.js");
var $$splitComponentImporter = () => import("./bricks._collectionName._brickName-YVsh6Sx5.js");
var Route = createFileRoute("/bricks/$collectionName/$brickName")({
	loader: ({ params }) => {
		const collection = Object.values(collectionsHash).find((candidate) => candidate.collectionName === params.collectionName);
		if (!collection) throw notFound();
		const brick = Object.values(collection.bricks).find((candidate) => candidate.def.name === params.brickName);
		if (!brick) throw notFound();
		return brick.def;
	},
	component: lazyRouteComponent($$splitComponentImporter, "component"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, "notFoundComponent")
});
//#endregion
export { Route as t };
