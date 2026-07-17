import { mapValues as e } from "es-toolkit/object";
import { Fragment as t, jsx as n, jsxs as r } from "react/jsx-runtime";
import { Image as i } from "@unpic/react";
import { useState as a } from "react";
import { clsx as o } from "clsx";
import { twMerge as s } from "tailwind-merge";
import c from "swr";
import { AlertCircle as l, BookOpen as u, GitBranch as d, GitFork as f, Link as p, MapPin as m, Monitor as ee, RefreshCw as te, Star as ne, Users as re } from "lucide-react";
import { Slot as ie } from "@radix-ui/react-slot";
import { cva as ae } from "class-variance-authority";
//#region src/makeBrick.ts
var h = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function g(e) {
	let { name: t, w: n, h: r, order: i, label: a, component: o } = e;
	if (!h.test(e.name)) throw Error(`makeBrick: name must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(e.name)}`);
	return {
		def: {
			name: t,
			w: n,
			h: r,
			order: i,
			label: a
		},
		component: o
	};
}
//#endregion
//#region src/makeCollection.ts
function _(t) {
	let { collectionName: n, collectionLabel: r, bricks: i } = t;
	return {
		collectionName: n,
		collectionLabel: r,
		bricks: e(i, (e) => {
			let { def: t, component: i } = e;
			return {
				def: {
					name: t.name,
					w: t.w,
					h: t.h,
					label: t.label ?? r,
					collectionName: n,
					collectionLabel: r,
					order: t.order
				},
				component: i
			};
		})
	};
}
//#endregion
//#region src/BrickFrame.tsx
function v({ backgroundClassName: e, textClassName: t, children: r }) {
	return /* @__PURE__ */ n("div", {
		className: `qrk-bricks ${e} ${t} flex h-full w-full select-none items-center justify-center overflow-hidden`,
		children: r
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircleGraphic.tsx
function y() {
	return /* @__PURE__ */ n("div", { className: "h-20 w-20 max-h-[85%] max-w-[85%] shrink-0 rounded-full bg-current" });
}
//#endregion
//#region src/collections/BlackCircle/BlackCircle1x1.tsx
function oe() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ n(y, {})
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircle2x2.tsx
function se() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ n(y, {})
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircle4x1.tsx
function ce() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ n(y, {})
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircleCollection.ts
var le = _({
	collectionName: "black-circle",
	collectionLabel: "Black circle",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: oe
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: se
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: ce
		})
	}
});
//#endregion
//#region src/collections/BlackMLogo/BlackMLogoGraphic.tsx
function b() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("path", {
			d: "M20 70 L20 30 L35 50 L50 30 L50 70 M50 70 L50 30 L65 50 L80 30 L80 70",
			fill: "currentColor"
		})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogo1x1.tsx
function ue() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ n(b, {})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogo2x2.tsx
function de() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ n(b, {})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogo4x1.tsx
function fe() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ n(b, {})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogoCollection.ts
var pe = _({
	collectionName: "black-m-logo",
	collectionLabel: "Black M",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: ue
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: de
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: fe
		})
	}
});
//#endregion
//#region src/collections/BlueGrid/BlueGridGraphic.tsx
function x() {
	return /* @__PURE__ */ r("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: [
			/* @__PURE__ */ n("rect", {
				x: "15",
				y: "15",
				width: "30",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "55",
				y: "15",
				width: "30",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "15",
				y: "55",
				width: "30",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "55",
				y: "55",
				width: "30",
				height: "30",
				fill: "currentColor"
			})
		]
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGrid1x1.tsx
function me() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#3B7FBD]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(x, {})
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGrid2x2.tsx
function he() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#3B7FBD]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(x, {})
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGrid4x1.tsx
function ge() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#3B7FBD]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(x, {})
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGridCollection.ts
var _e = _({
	collectionName: "blue-grid",
	collectionLabel: "Blue grid",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: me
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: he
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: ge
		})
	}
});
//#endregion
//#region src/collections/CreamBench/CreamBenchGraphic.tsx
function S() {
	return /* @__PURE__ */ r("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: [/* @__PURE__ */ n("rect", {
			x: "20",
			y: "50",
			width: "25",
			height: "30",
			fill: "currentColor"
		}), /* @__PURE__ */ n("rect", {
			x: "55",
			y: "30",
			width: "25",
			height: "50",
			fill: "currentColor"
		})]
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBench1x1.tsx
function ve() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(S, {})
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBench2x2.tsx
function ye() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(S, {})
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBench4x1.tsx
function C() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(S, {})
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBenchCollection.ts
var w = _({
	collectionName: "cream-bench",
	collectionLabel: "Cream bench",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: ve
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: ye
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: C
		})
	}
});
//#endregion
//#region src/collections/CreamSquare/CreamSquareGraphic.tsx
function T() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("rect", {
			x: "25",
			y: "25",
			width: "50",
			height: "50",
			rx: "8",
			stroke: "currentColor",
			strokeWidth: "6",
			fill: "none"
		})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquare1x1.tsx
function E() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(T, {})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquare2x2.tsx
function D() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(T, {})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquare4x1.tsx
function O() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(T, {})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquareCollection.ts
var k = _({
	collectionName: "cream-square",
	collectionLabel: "Cream square",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: E
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: D
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: O
		})
	}
});
//#endregion
//#region src/collections/Figma/FigmaPromo4x4.tsx
function A() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-neutral-100",
		textClassName: "text-black",
		children: /* @__PURE__ */ r("div", {
			className: "relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg",
			children: [/* @__PURE__ */ n(i, {
				src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png",
				alt: "White Bay Power Station - Historic industrial brick building with Sydney skyline in background",
				className: "absolute inset-0 h-full w-full object-cover",
				layout: "fullWidth",
				height: 800,
				sizes: "(max-width: 768px) 100vw, 50vw"
			}), /* @__PURE__ */ r("div", {
				className: "absolute bottom-0 left-0 right-0 flex items-end justify-between bg-white px-4 py-3",
				children: [/* @__PURE__ */ r("h2", {
					className: "text-2xl font-semibold leading-tight text-black",
					children: [
						"White Bay",
						/* @__PURE__ */ n("br", {}),
						"Power Station"
					]
				}), /* @__PURE__ */ r("svg", {
					className: "h-6 w-6 shrink-0",
					viewBox: "0 0 38 57",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					children: [
						/* @__PURE__ */ n("path", {
							d: "M19 28.5C19 31.6826 16.4526 34.25 13.2941 34.25H7.58824V22.75H13.2941C16.4526 22.75 19 25.3174 19 28.5Z",
							fill: "#A259FF"
						}),
						/* @__PURE__ */ n("path", {
							d: "M7.58824 11.25H13.2941C16.4526 11.25 19 13.8174 19 17C19 20.1826 16.4526 22.75 13.2941 22.75H7.58824V11.25Z",
							fill: "#F24E1E"
						}),
						/* @__PURE__ */ n("path", {
							d: "M7.58824 34.25H13.2941C16.4526 34.25 19 36.8174 19 40C19 43.1826 16.4526 45.75 13.2941 45.75H13.2941C10.1357 45.75 7.58824 43.1826 7.58824 40V34.25Z",
							fill: "#0ACF83"
						}),
						/* @__PURE__ */ n("path", {
							d: "M19 11.25H24.7059C27.8643 11.25 30.4118 13.8174 30.4118 17C30.4118 20.1826 27.8643 22.75 24.7059 22.75H19V11.25Z",
							fill: "#FF7262"
						}),
						/* @__PURE__ */ n("path", {
							d: "M30.4118 28.5C30.4118 31.6826 27.8643 34.25 24.7059 34.25C21.5474 34.25 19 31.6826 19 28.5C19 25.3174 21.5474 22.75 24.7059 22.75C27.8643 22.75 30.4118 25.3174 30.4118 28.5Z",
							fill: "#1ABCFE"
						})
					]
				})]
			})]
		})
	});
}
//#endregion
//#region src/collections/Figma/FigmaCollection.ts
var j = _({
	collectionName: "figma",
	collectionLabel: "Figma",
	bricks: { "4x4": g({
		name: "4x4",
		w: 4,
		h: 4,
		label: "4×4",
		order: 0,
		component: A
	}) }
});
//#endregion
//#region src/collections/GreenArch/GreenArchGraphic.tsx
function M() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("path", {
			d: "M20 80 L20 50 Q20 20 50 20 Q80 20 80 50 L80 80 M40 80 L40 50 Q40 40 50 40 Q60 40 60 50 L60 80",
			fill: "currentColor"
		})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArch1x1.tsx
function N() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(M, {})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArch2x2.tsx
function P() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(M, {})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArch4x1.tsx
function be() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(M, {})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArchCollection.ts
var xe = _({
	collectionName: "green-arch",
	collectionLabel: "Green arch",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: N
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: P
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: be
		})
	}
});
//#endregion
//#region src/utils/cn.ts
function F(...e) {
	return s(o(e));
}
//#endregion
//#region src/ui/card.tsx
function I({ className: e, ...t }) {
	return /* @__PURE__ */ n("div", {
		"data-slot": "card",
		className: F("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm", e),
		...t
	});
}
function L({ className: e, ...t }) {
	return /* @__PURE__ */ n("div", {
		"data-slot": "card-header",
		className: F("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", e),
		...t
	});
}
function Se({ className: e, ...t }) {
	return /* @__PURE__ */ n("div", {
		"data-slot": "card-title",
		className: F("leading-none font-semibold", e),
		...t
	});
}
function R({ className: e, ...t }) {
	return /* @__PURE__ */ n("div", {
		"data-slot": "card-content",
		className: F("px-6", e),
		...t
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubAchievementsCard.tsx
var Ce = [
	{
		id: "starstruck",
		name: "Starstruck",
		image: "https://github.githubassets.com/images/modules/profile/achievements/starstruck-default.png",
		gradient: "from-amber-200 via-orange-200 to-rose-200"
	},
	{
		id: "pair-extraordinaire",
		name: "Pair Extraordinaire",
		image: "https://github.githubassets.com/images/modules/profile/achievements/pair-extraordinaire-default.png",
		gradient: "from-emerald-200 via-green-200 to-lime-200"
	},
	{
		id: "pull-shark",
		name: "Pull Shark",
		image: "https://github.githubassets.com/images/modules/profile/achievements/pull-shark-default.png",
		gradient: "from-cyan-200 via-sky-200 to-blue-200"
	},
	{
		id: "galaxy-brain",
		name: "Galaxy Brain",
		image: "https://github.githubassets.com/images/modules/profile/achievements/galaxy-brain-default.png",
		gradient: "from-purple-200 via-violet-200 to-fuchsia-200"
	},
	{
		id: "quickdraw",
		name: "Quickdraw",
		image: "https://github.githubassets.com/images/modules/profile/achievements/quickdraw-default.png",
		gradient: "from-indigo-200 via-purple-200 to-pink-200"
	},
	{
		id: "arctic-code-vault",
		name: "Arctic Code Vault",
		image: "https://github.githubassets.com/images/modules/profile/achievements/arctic-code-vault-contributor-default.png",
		gradient: "from-sky-200 via-blue-200 to-indigo-200"
	},
	{
		id: "yolo",
		name: "YOLO",
		image: "https://github.githubassets.com/images/modules/profile/achievements/yolo-default.png",
		gradient: "from-rose-200 via-pink-200 to-fuchsia-200"
	},
	{
		id: "public-sponsor",
		name: "Public Sponsor",
		image: "https://github.githubassets.com/images/modules/profile/achievements/public-sponsor-default.png",
		gradient: "from-pink-200 via-rose-200 to-red-200"
	}
];
function we({ achievement: e }) {
	return /* @__PURE__ */ n("div", {
		className: "flex flex-col items-center gap-1",
		children: /* @__PURE__ */ n("div", {
			className: `h-14 w-14 rounded-full bg-gradient-to-br p-0.5 shadow-lg sm:h-16 sm:w-16 md:h-20 md:w-20 ${e.gradient}`,
			children: /* @__PURE__ */ n("div", {
				className: "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-zinc-900",
				children: /* @__PURE__ */ n(i, {
					src: e.image,
					alt: e.name,
					width: 64,
					height: 64,
					loading: "eager",
					className: "h-10 w-10 object-contain sm:h-12 sm:w-12 md:h-14 md:w-14"
				})
			})
		})
	});
}
function Te() {
	return /* @__PURE__ */ r(I, {
		className: "h-full min-h-0 w-full gap-2 overflow-hidden rounded-none border border-zinc-800 bg-zinc-950 py-3 shadow-none",
		children: [/* @__PURE__ */ n(L, {
			className: "shrink-0 px-4 pb-2 pt-0",
			children: /* @__PURE__ */ n(Se, {
				className: "text-lg font-semibold text-zinc-100",
				children: "Achievements"
			})
		}), /* @__PURE__ */ n(R, {
			className: "min-h-0 flex-1 overflow-auto px-4 pb-4",
			children: /* @__PURE__ */ n("div", {
				className: "grid grid-cols-4 gap-2 md:gap-4",
				children: Ce.map((e) => /* @__PURE__ */ n(we, { achievement: e }, e.id))
			})
		})]
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubAchievements4x2.tsx
function Ee() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-zinc-950",
		textClassName: "text-zinc-100",
		children: /* @__PURE__ */ n("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ n(Te, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubLanguagesCard.tsx
var De = "morgs32", Oe = "ink-steps", ke = (e) => fetch(e).then((e) => e.json()), Ae = {
	TypeScript: "#3178c6",
	JavaScript: "#f1e05a",
	Python: "#3572A5",
	Rust: "#dea584",
	Go: "#00ADD8",
	Shell: "#89e051",
	HTML: "#e34c26",
	CSS: "#563d7c",
	Java: "#b07219",
	Ruby: "#701516",
	PHP: "#4F5D95",
	"C++": "#f34b7d",
	C: "#555555",
	"C#": "#178600",
	Swift: "#ffac45",
	Kotlin: "#A97BFF",
	Dart: "#00B4AB",
	Vue: "#41b883",
	Svelte: "#ff3e00",
	SCSS: "#c6538c",
	Less: "#1d365d",
	Makefile: "#427819",
	Dockerfile: "#384d54"
}, z = (e) => Ae[e] || "#8b8b8b";
function je() {
	let { data: e, error: t, isLoading: i } = c(`https://api.github.com/repos/${De}/${Oe}/languages`, ke);
	if (i) return /* @__PURE__ */ n(I, {
		className: "border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none",
		children: /* @__PURE__ */ n(R, {
			className: "p-3",
			children: /* @__PURE__ */ r("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ n("div", { className: "bg-muted h-20 w-20 animate-pulse rounded-full" }), /* @__PURE__ */ n("div", {
					className: "flex-1 space-y-2",
					children: [...[
						,
						,
						,
						,
						,
					]].map((e, t) => /* @__PURE__ */ n("div", { className: "bg-muted h-3 rounded animate-pulse" }, t))
				})]
			})
		})
	});
	if (t || !e) return /* @__PURE__ */ n(I, {
		className: "border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none",
		children: /* @__PURE__ */ n(R, {
			className: "p-3",
			children: /* @__PURE__ */ n("p", {
				className: "text-muted-foreground text-xs",
				children: "Failed to load languages"
			})
		})
	});
	let a = Object.values(e).reduce((e, t) => e + t, 0), o = Object.entries(e).map(([e, t]) => ({
		name: e,
		bytes: t,
		percentage: Math.round(t / a * 100)
	})).sort((e, t) => t.bytes - e.bytes), s = o.filter((e) => e.percentage >= 1), l = o.filter((e) => e.percentage < 1).reduce((e, t) => e + t.percentage, 0), u = l > 0 ? [...s, {
		name: "Others",
		bytes: 0,
		percentage: l
	}] : s, d = 0, f = u.map((e) => {
		let t = d;
		return d += e.percentage, {
			...e,
			start: t,
			end: d
		};
	}), p = 2 * Math.PI * 30;
	return /* @__PURE__ */ n(I, {
		className: "border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none",
		children: /* @__PURE__ */ n(R, {
			className: "min-h-0 flex-1 overflow-auto p-3",
			children: /* @__PURE__ */ r("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ n("div", {
					className: "relative shrink-0",
					children: /* @__PURE__ */ n("svg", {
						width: 72,
						height: 72,
						className: "-rotate-90 transform",
						children: f.map((e) => {
							let t = `${e.percentage / 100 * p} ${p}`, r = -(e.start / 100) * p;
							return /* @__PURE__ */ n("circle", {
								cx: 72 / 2,
								cy: 72 / 2,
								r: 30,
								fill: "none",
								stroke: z(e.name),
								strokeWidth: 12,
								strokeDasharray: t,
								strokeDashoffset: r,
								className: "transition-all duration-300"
							}, e.name);
						})
					})
				}), /* @__PURE__ */ n("div", {
					className: "grid min-w-0 flex-1 grid-cols-1 gap-1",
					children: u.map((e) => /* @__PURE__ */ r("div", {
						className: "flex items-center justify-between text-xs",
						children: [/* @__PURE__ */ r("div", {
							className: "flex min-w-0 items-center gap-1.5",
							children: [/* @__PURE__ */ n("span", {
								className: "h-2.5 w-2.5 shrink-0 rounded-sm",
								style: { backgroundColor: z(e.name) }
							}), /* @__PURE__ */ n("span", {
								className: "text-foreground truncate",
								children: e.name
							})]
						}), /* @__PURE__ */ r("span", {
							className: "text-muted-foreground shrink-0 tabular-nums",
							children: [e.percentage, "%"]
						})]
					}, e.name))
				})]
			})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubLanguages2x2.tsx
function Me() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-card",
		textClassName: "text-card-foreground",
		children: /* @__PURE__ */ n("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ n(je, {})
		})
	});
}
//#endregion
//#region src/ui/button.tsx
var Ne = ae("inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
			destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
			outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
			secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
			ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
			link: "text-primary underline-offset-4 hover:underline"
		},
		size: {
			default: "h-9 px-4 py-2 has-[>svg]:px-3",
			sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
			lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
			icon: "size-9"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Pe({ className: e, variant: t, size: r, asChild: i = !1, ...a }) {
	return /* @__PURE__ */ n(i ? ie : "button", {
		"data-slot": "button",
		className: F(Ne({
			variant: t,
			size: r,
			className: e
		})),
		...a
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfileCard.tsx
var Fe = "https://api.github.com/users/morgs32", Ie = (e) => fetch(e).then((e) => e.json()), B = "h-full min-h-0 w-full gap-3 overflow-hidden rounded-none border border-[#30363d] bg-[#0d1117] py-4 text-[#c9d1d9] shadow-none", V = "text-[#8b949e]", H = "text-[#f0f6fc]";
function Le() {
	let e = [];
	for (let t = 0; t < 26; t++) {
		let t = [];
		for (let e = 0; e < 7; e++) {
			let e = Math.random();
			e < .3 ? t.push(0) : e < .5 ? t.push(1) : e < .7 ? t.push(2) : e < .85 ? t.push(3) : t.push(4);
		}
		e.push(t);
	}
	return e;
}
var U = [
	"bg-[#161b22]",
	"bg-[#0e4429]",
	"bg-[#006d32]",
	"bg-[#26a641]",
	"bg-[#39d353]"
], Re = [
	"Nov",
	"Dec",
	"Jan",
	"Feb",
	"Mar",
	"Apr"
], ze = [
	"Mon",
	"Wed",
	"Fri"
];
function Be() {
	let e = Le();
	return /* @__PURE__ */ r("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ n("p", {
			className: `text-sm ${V}`,
			children: "2,560 contributions in the last year"
		}), /* @__PURE__ */ n("div", {
			className: "overflow-x-auto",
			children: /* @__PURE__ */ r("div", {
				className: "inline-block",
				children: [
					/* @__PURE__ */ n("div", {
						className: "mb-1 ml-8 flex",
						children: Re.map((e) => /* @__PURE__ */ n("span", {
							className: `text-xs ${V}`,
							style: { width: `${26 / 6 * 13}px` },
							children: e
						}, e))
					}),
					/* @__PURE__ */ r("div", {
						className: "flex gap-0.5",
						children: [/* @__PURE__ */ n("div", {
							className: "flex w-7 flex-col justify-around pr-1",
							children: ze.map((e) => /* @__PURE__ */ n("span", {
								className: `text-xs leading-3 ${V}`,
								children: e
							}, e))
						}), /* @__PURE__ */ n("div", {
							className: "flex gap-[3px]",
							children: e.map((e, t) => /* @__PURE__ */ n("div", {
								className: "flex flex-col gap-[3px]",
								children: e.map((e, t) => /* @__PURE__ */ n("div", { className: `h-[11px] w-[11px] rounded-full ${U[e]}` }, t))
							}, t))
						})]
					}),
					/* @__PURE__ */ r("div", {
						className: "mt-2 flex items-center justify-end gap-1",
						children: [
							/* @__PURE__ */ n("span", {
								className: `mr-1 text-xs ${V}`,
								children: "Less"
							}),
							U.map((e, t) => /* @__PURE__ */ n("div", { className: `h-[11px] w-[11px] rounded-full ${e}` }, t)),
							/* @__PURE__ */ n("span", {
								className: `ml-1 text-xs ${V}`,
								children: "More"
							})
						]
					})
				]
			})
		})]
	});
}
function Ve(e) {
	let { onRetry: i } = e;
	return /* @__PURE__ */ r(t, { children: [
		/* @__PURE__ */ r("div", {
			className: "relative mb-3",
			children: [/* @__PURE__ */ n("div", { className: "absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-lg" }), /* @__PURE__ */ n("div", {
				className: "relative rounded-full border border-red-500/20 bg-red-500/10 p-3",
				children: /* @__PURE__ */ n(l, {
					className: "h-7 w-7 text-red-400",
					"aria-hidden": !0
				})
			})]
		}),
		/* @__PURE__ */ r("div", {
			className: "relative mb-3",
			children: [/* @__PURE__ */ n(d, {
				className: "h-10 w-10 text-zinc-600",
				"aria-hidden": !0
			}), /* @__PURE__ */ n("div", {
				className: "absolute -bottom-0.5 -right-0.5 rounded-full bg-red-500 p-0.5",
				children: /* @__PURE__ */ n(l, {
					className: "h-3 w-3 text-white",
					"aria-hidden": !0
				})
			})]
		}),
		/* @__PURE__ */ n("h2", {
			className: `mb-1.5 text-center text-base font-medium ${H}`,
			children: "Failed to load GitHub profile"
		}),
		/* @__PURE__ */ n("p", {
			className: "mb-4 max-w-[min(100%,16rem)] text-center text-xs text-zinc-500",
			children: "We couldn't fetch the profile data. Please check your connection and try again."
		}),
		/* @__PURE__ */ r(Pe, {
			type: "button",
			variant: "outline",
			size: "sm",
			className: "border-zinc-700 bg-transparent text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100",
			onClick: i,
			children: [/* @__PURE__ */ n(te, { className: "h-4 w-4" }), "Try Again"]
		})
	] });
}
function He(e) {
	let { src: t, alt: r, fallback: o } = e, [s, c] = a(!1);
	return s || !t ? /* @__PURE__ */ n("div", {
		className: "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#21262d] text-sm font-medium text-[#f0f6fc]",
		children: o
	}) : /* @__PURE__ */ n(i, {
		src: t,
		alt: r,
		width: 64,
		height: 64,
		className: "h-16 w-16 shrink-0 rounded-full object-cover",
		onError: () => c(!0)
	});
}
function Ue() {
	let { data: e, error: t, isLoading: i, mutate: a } = c(Fe, Ie);
	if (i) return /* @__PURE__ */ n(I, {
		className: B,
		children: /* @__PURE__ */ n(R, {
			className: "p-4",
			children: /* @__PURE__ */ n("div", {
				className: "animate-pulse space-y-4",
				children: /* @__PURE__ */ r("div", {
					className: "flex items-center gap-4",
					children: [/* @__PURE__ */ n("div", { className: "h-16 w-16 rounded-full bg-[#21262d]" }), /* @__PURE__ */ r("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ n("div", { className: "h-5 w-32 rounded bg-[#21262d]" }), /* @__PURE__ */ n("div", { className: "h-4 w-24 rounded bg-[#21262d]" })]
					})]
				})
			})
		})
	});
	if (t || !e || typeof e.login != "string" || e.login.length === 0) return /* @__PURE__ */ n(I, {
		className: `${B} flex min-h-0 flex-col`,
		children: /* @__PURE__ */ n(R, {
			className: "flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-3 py-4 text-center",
			children: /* @__PURE__ */ n(Ve, { onRetry: () => void a() })
		})
	});
	let o = e.name || e.login, s = e.login.slice(0, 2).toUpperCase();
	return /* @__PURE__ */ r(I, {
		className: B,
		children: [/* @__PURE__ */ n(L, {
			className: "shrink-0 px-4 pb-2 pt-0",
			children: /* @__PURE__ */ r("div", {
				className: "flex items-start gap-4",
				children: [/* @__PURE__ */ n(He, {
					src: typeof e.avatar_url == "string" ? e.avatar_url : "",
					alt: o,
					fallback: s
				}), /* @__PURE__ */ r("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ n("h2", {
							className: `text-xl font-semibold ${H}`,
							children: o
						}),
						/* @__PURE__ */ r("p", {
							className: V,
							children: ["@", e.login]
						}),
						e.bio && /* @__PURE__ */ n("p", {
							className: `mt-1 text-sm ${V}`,
							children: e.bio
						})
					]
				})]
			})
		}), /* @__PURE__ */ r(R, {
			className: "min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4",
			children: [
				/* @__PURE__ */ r("div", {
					className: `flex flex-wrap gap-4 text-sm ${V}`,
					children: [e.location && /* @__PURE__ */ r("div", {
						className: "flex items-center gap-1",
						children: [/* @__PURE__ */ n(m, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ n("span", { children: e.location })]
					}), e.blog && /* @__PURE__ */ r("a", {
						href: e.blog.startsWith("http") ? e.blog : `https://${e.blog}`,
						target: "_blank",
						rel: "noopener noreferrer",
						className: `flex items-center gap-1 transition-colors hover:text-[#58a6ff] ${V}`,
						children: [/* @__PURE__ */ n(p, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ n("span", { children: e.blog.replace(/^https?:\/\//, "") })]
					})]
				}),
				/* @__PURE__ */ r("div", {
					className: "flex gap-4 text-sm",
					children: [
						/* @__PURE__ */ r("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ n(re, { className: `h-4 w-4 shrink-0 ${V}` }),
								/* @__PURE__ */ n("span", {
									className: `font-medium ${H}`,
									children: e.followers
								}),
								/* @__PURE__ */ n("span", {
									className: V,
									children: "followers"
								})
							]
						}),
						/* @__PURE__ */ r("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ n("span", {
								className: `font-medium ${H}`,
								children: e.following
							}), /* @__PURE__ */ n("span", {
								className: V,
								children: "following"
							})]
						}),
						/* @__PURE__ */ r("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ n(u, { className: `h-4 w-4 shrink-0 ${V}` }),
								/* @__PURE__ */ n("span", {
									className: `font-medium ${H}`,
									children: e.public_repos
								}),
								/* @__PURE__ */ n("span", {
									className: V,
									children: "repos"
								})
							]
						})
					]
				}),
				/* @__PURE__ */ n("div", {
					className: "border-t border-[#30363d] pt-2",
					children: /* @__PURE__ */ n(Be, {})
				})
			]
		})]
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfile4x4.tsx
function We() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#0d1117]",
		textClassName: "text-[#c9d1d9]",
		children: /* @__PURE__ */ n("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ n(Ue, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubRepoCard.tsx
var Ge = "morgs32", Ke = "ink-steps", qe = (e) => fetch(e).then((e) => e.json());
function Je() {
	let { data: e, isLoading: t } = c(`https://api.github.com/repos/${Ge}/${Ke}`, qe);
	return t ? /* @__PURE__ */ n(I, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none",
		children: /* @__PURE__ */ n(R, {
			className: "p-4",
			children: /* @__PURE__ */ r("div", {
				className: "animate-pulse space-y-3",
				children: [
					/* @__PURE__ */ n("div", { className: "h-5 w-1/2 rounded bg-zinc-700" }),
					/* @__PURE__ */ n("div", { className: "h-4 w-3/4 rounded bg-zinc-700" }),
					/* @__PURE__ */ n("div", { className: "mt-4 h-4 w-1/4 rounded bg-zinc-700" })
				]
			})
		})
	}) : !e || e.name === void 0 ? /* @__PURE__ */ n(I, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none",
		children: /* @__PURE__ */ n(R, {
			className: "p-4",
			children: /* @__PURE__ */ n("p", {
				className: "text-zinc-400",
				children: "Repository not found"
			})
		})
	}) : /* @__PURE__ */ n(I, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none transition-colors hover:border-zinc-600",
		children: /* @__PURE__ */ n("a", {
			href: e.html_url,
			target: "_blank",
			rel: "noopener noreferrer",
			className: "block h-full min-h-0",
			children: /* @__PURE__ */ r(R, {
				className: "flex h-full min-h-0 flex-col p-4",
				children: [
					/* @__PURE__ */ r("div", {
						className: "mb-2 flex items-center gap-2",
						children: [/* @__PURE__ */ n(ee, { className: "h-5 w-5 text-zinc-400" }), /* @__PURE__ */ n("h3", {
							className: "text-lg font-semibold text-zinc-100",
							children: e.name
						})]
					}),
					/* @__PURE__ */ n("p", {
						className: "text-zinc-400 mb-4 min-h-0 flex-1 text-sm",
						children: e.description || "No description provided"
					}),
					/* @__PURE__ */ r("div", {
						className: "text-zinc-400 mt-auto flex items-center gap-4 text-sm",
						children: [
							/* @__PURE__ */ r("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ n(ne, { className: "h-4 w-4" }), /* @__PURE__ */ n("span", { children: e.stargazers_count })]
							}),
							e.forks_count > 0 && /* @__PURE__ */ r("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ n(f, { className: "h-4 w-4" }), /* @__PURE__ */ n("span", { children: e.forks_count })]
							}),
							e.language && /* @__PURE__ */ r("div", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ n("span", { className: "h-3 w-3 rounded-full bg-yellow-400" }), /* @__PURE__ */ n("span", { children: e.language })]
							})
						]
					})
				]
			})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubRepo4x2.tsx
function Ye() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-zinc-900",
		textClassName: "text-zinc-100",
		children: /* @__PURE__ */ n("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ n(Je, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubCardsCollection.ts
var Xe = _({
	collectionName: "github-cards",
	collectionLabel: "GitHub",
	bricks: {
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 0,
			component: We
		}),
		"achievements-4x2": g({
			name: "achievements-4x2",
			w: 4,
			h: 2,
			label: "4×2",
			order: 1,
			component: Ee
		}),
		"repo-4x2": g({
			name: "repo-4x2",
			w: 4,
			h: 2,
			label: "4×2",
			order: 2,
			component: Ye
		}),
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 3,
			component: Me
		})
	}
});
//#endregion
//#region src/collections/Image/ImagePromo4x4.tsx
function Ze() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-neutral-100",
		textClassName: "text-black",
		children: /* @__PURE__ */ r("div", {
			className: "relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg",
			children: [/* @__PURE__ */ n(i, {
				src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png",
				alt: "White Bay Power Station - Historic industrial brick building with Sydney skyline in background",
				className: "absolute inset-0 h-full w-full object-cover",
				layout: "fullWidth",
				height: 800,
				sizes: "(max-width: 768px) 100vw, 50vw"
			}), /* @__PURE__ */ n("div", {
				className: "absolute bottom-0 left-0 right-0 bg-white px-4 py-3",
				children: /* @__PURE__ */ r("h2", {
					className: "text-2xl font-semibold leading-tight text-black",
					children: [
						"White Bay",
						/* @__PURE__ */ n("br", {}),
						"Power Station"
					]
				})
			})]
		})
	});
}
//#endregion
//#region src/collections/Image/ImageCollection.ts
var Qe = _({
	collectionName: "image",
	collectionLabel: "Image",
	bricks: { "4x4": g({
		name: "4x4",
		w: 4,
		h: 4,
		label: "4×4",
		order: 0,
		component: Ze
	}) }
});
//#endregion
//#region src/collections/GreenCross/GreenCrossGraphic.tsx
function W() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-12 w-12 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("path", {
			d: "M30 30 L45 50 L30 70 M70 30 L55 50 L70 70",
			stroke: "currentColor",
			strokeWidth: "6",
			strokeLinecap: "round",
			fill: "none"
		})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCross1x1.tsx
function $e() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(W, {})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCross2x2.tsx
function et() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(W, {})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCross4x1.tsx
function tt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(W, {})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCrossCollection.ts
var nt = _({
	collectionName: "green-cross",
	collectionLabel: "Green cross",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: $e
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: et
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: tt
		})
	}
});
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty1x1.tsx
function rt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty2x2.tsx
function it() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty4x1.tsx
function at() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmptyCollection.ts
var ot = _({
	collectionName: "green-empty",
	collectionLabel: "Green empty",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: rt
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 0,
			component: it
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: at
		})
	}
});
//#endregion
//#region src/collections/GreenGLogo/GreenGLogoGraphic.tsx
function G() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("path", {
			d: "M70 30 Q30 30 30 50 Q30 70 50 70 L70 70 L70 50 L50 50",
			stroke: "currentColor",
			strokeWidth: "8",
			fill: "none"
		})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogo1x1.tsx
function st() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(G, {})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogo2x2.tsx
function ct() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(G, {})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogo4x1.tsx
function lt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(G, {})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogoCollection.ts
var ut = _({
	collectionName: "green-g-logo",
	collectionLabel: "Green G",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: st
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: ct
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: lt
		})
	}
});
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocksGraphic.tsx
function K() {
	return /* @__PURE__ */ r("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: [
			/* @__PURE__ */ n("rect", {
				x: "20",
				y: "20",
				width: "30",
				height: "60",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "55",
				y: "20",
				width: "25",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "55",
				y: "55",
				width: "25",
				height: "25",
				fill: "currentColor"
			})
		]
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocks1x1.tsx
function dt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(K, {})
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocks2x2.tsx
function ft() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(K, {})
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocks4x1.tsx
function pt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(K, {})
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocksCollection.ts
var mt = _({
	collectionName: "orange-block",
	collectionLabel: "Orange blocks",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: dt
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: ft
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: pt
		})
	}
});
//#endregion
//#region src/collections/OrangeFlag/OrangeFlagGraphic.tsx
function q() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("path", {
			d: "M32 37L68 52L32 64",
			fill: "black"
		})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlag1x1.tsx
function ht() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(q, {})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlag2x2.tsx
function gt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(q, {})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlag4x1.tsx
function _t() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(q, {})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlagCollection.ts
var vt = _({
	collectionName: "orange-flag",
	collectionLabel: "Orange flag",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: ht
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: gt
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: _t
		})
	}
});
//#endregion
//#region src/collections/PinkAsterisk/PinkAsteriskGraphic.tsx
function J() {
	return /* @__PURE__ */ n("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ n("path", {
			d: "M50 20 L50 80 M20 35 L80 65 M20 65 L80 35",
			stroke: "currentColor",
			strokeWidth: "8",
			strokeLinecap: "round"
		})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk1x1.tsx
function yt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(J, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk2x2.tsx
function bt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(J, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk4x1.tsx
function xt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(J, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsteriskCollection.ts
var St = _({
	collectionName: "pink-asterisk",
	collectionLabel: "Pink asterisk",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: yt
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: bt
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: xt
		})
	}
});
//#endregion
//#region src/collections/PinkDots/PinkDotsGraphic.tsx
function Y() {
	return /* @__PURE__ */ n("div", {
		className: "grid max-h-[85%] max-w-[85%] shrink-0 grid-cols-3 gap-3",
		children: [...Array(9)].map((e, t) => /* @__PURE__ */ n("div", { className: "h-3 w-3 rounded-full bg-current" }, t))
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDots1x1.tsx
function X() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(Y, {})
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDots2x2.tsx
function Ct() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(Y, {})
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDots4x1.tsx
function wt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ n(Y, {})
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDotsCollection.ts
var Tt = _({
	collectionName: "pink-dots",
	collectionLabel: "Pink dots",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: X
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: Ct
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: wt
		})
	}
});
//#endregion
//#region src/collections/PurpleLines/PurpleLinesGraphic.tsx
function Z() {
	return /* @__PURE__ */ r("svg", {
		viewBox: "0 0 100 100",
		className: "h-20 w-20 max-h-[85%] max-w-[85%] shrink-0",
		children: [
			/* @__PURE__ */ n("rect", {
				x: "20",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "35",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "50",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			}),
			/* @__PURE__ */ n("rect", {
				x: "65",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			})
		]
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLines1x1.tsx
function Et() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#8B7BB5]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(Z, {})
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLines2x2.tsx
function Dt() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#8B7BB5]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(Z, {})
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLines4x1.tsx
function Ot() {
	return /* @__PURE__ */ n(v, {
		backgroundClassName: "bg-[#8B7BB5]",
		textClassName: "text-black",
		children: /* @__PURE__ */ n(Z, {})
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLinesCollection.ts
var kt = _({
	collectionName: "purple-lines",
	collectionLabel: "Purple lines",
	bricks: {
		"2x2": g({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: Et
		}),
		"4x4": g({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: Dt
		}),
		"8x2": g({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: Ot
		})
	}
});
//#endregion
//#region src/collections/TextBrick/TextBrickPresentation.tsx
function Q({ title: e, category: t, w: i, h: a }) {
	let o = i === 4 && a === 1;
	return /* @__PURE__ */ r("div", {
		className: `select-none flex h-full w-full flex-col justify-center bg-neutral-400 transition-colors duration-200 hover:bg-neutral-100 dark:bg-neutral-700 dark:hover:bg-neutral-500 shadow-[inset_0_1px_0_0_rgb(255_255_255),inset_0_-1px_0_0_rgb(255_255_255)] ${o ? "px-4 py-2" : "p-4"}`,
		children: [/* @__PURE__ */ n("div", {
			className: `font-medium ${o ? "text-sm" : "text-base"}`,
			children: e
		}), /* @__PURE__ */ n("div", {
			className: `text-muted-foreground ${o ? "text-xs" : "text-sm"}`,
			children: t
		})]
	});
}
//#endregion
//#region src/collections/TextBrick/TextBrick2x2.tsx
function At() {
	return /* @__PURE__ */ n(Q, {
		title: "Text brick",
		category: "Sample",
		w: 2,
		h: 2
	});
}
//#endregion
//#region src/collections/TextBrick/TextBrick4x1.tsx
function jt() {
	return /* @__PURE__ */ n(Q, {
		title: "Text brick",
		category: "Sample",
		w: 4,
		h: 1
	});
}
//#endregion
//#region src/collectionsHash.ts
var $ = {
	"orange-flag": vt,
	"black-circle": le,
	"green-arch": xe,
	"blue-grid": _e,
	"cream-bench": w,
	"green-g-logo": ut,
	"cream-square": k,
	"pink-dots": Tt,
	"black-m-logo": pe,
	"orange-block": mt,
	"purple-lines": kt,
	"pink-asterisk": St,
	"green-empty": ot,
	"green-cross": nt,
	"github-cards": Xe,
	figma: j,
	image: Qe,
	"text-brick": _({
		collectionName: "text-brick",
		collectionLabel: "Text brick",
		bricks: {
			"4x4": g({
				name: "4x4",
				w: 4,
				h: 4,
				label: "4×4",
				order: 1,
				component: At
			}),
			"8x2": g({
				name: "8x2",
				w: 8,
				h: 2,
				label: "8×2",
				order: 0,
				component: jt
			})
		}
	})
};
//#endregion
//#region src/findCollectionBrick.ts
function Mt(e) {
	let t = $[e.collectionName];
	if (t) return t.bricks[e.name];
}
//#endregion
export { $ as collectionsHash, Mt as findCollectionBrick };
