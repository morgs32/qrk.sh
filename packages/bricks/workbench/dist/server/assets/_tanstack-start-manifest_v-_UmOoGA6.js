//#region \0tanstack-start-manifest:v
var tsrStartManifest = () => ({ routes: {
	__root__: {
		filePath: "/Users/morgs32/GitHub/qrk.sh/packages/bricks/workbench/src/routes/__root.tsx",
		children: [
			"/",
			"/collections/$collectionName",
			"/bricks/$collectionName/$brickName"
		],
		preloads: ["/assets/index-CS4IjmN9.js", "/assets/link-C00nv1XO.js"],
		scripts: [{ attrs: {
			type: "module",
			async: !0,
			src: "/assets/index-CS4IjmN9.js"
		} }]
	},
	"/": {
		filePath: "/Users/morgs32/GitHub/qrk.sh/packages/bricks/workbench/src/routes/index.tsx",
		children: void 0,
		preloads: ["/assets/routes-PYPd9dbG.js"]
	},
	"/collections/$collectionName": {
		filePath: "/Users/morgs32/GitHub/qrk.sh/packages/bricks/workbench/src/routes/collections.$collectionName.tsx",
		children: void 0,
		preloads: ["/assets/collections._collectionName-BCYMuiVZ.js", "/assets/collections._collectionName-DZsW8CBL.js"]
	},
	"/bricks/$collectionName/$brickName": {
		filePath: "/Users/morgs32/GitHub/qrk.sh/packages/bricks/workbench/src/routes/bricks.$collectionName.$brickName.tsx",
		children: void 0,
		preloads: ["/assets/bricks._collectionName._brickName-Ba8U88Oq.js", "/assets/bricks._collectionName._brickName-CKzygqRW.js"]
	}
} });
//#endregion
export { tsrStartManifest };
