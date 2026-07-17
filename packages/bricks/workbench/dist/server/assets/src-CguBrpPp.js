import { useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { mapValues } from "es-toolkit/object";
import { Image } from "@unpic/react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import useSWR from "swr";
import { AlertCircle, BookOpen, GitBranch, GitFork, Link, MapPin, Monitor, RefreshCw, Star, Users } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
//#region src/makeBrick.ts
var KEBAB_BRICK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function makeBrick(props) {
	const { name, w, h, order, label, component } = props;
	if (!KEBAB_BRICK_NAME.test(props.name)) throw new Error(`makeBrick: name must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(props.name)}`);
	return {
		def: {
			name,
			w,
			h,
			order,
			label
		},
		component
	};
}
//#endregion
//#region src/makeCollection.ts
function makeCollection(props) {
	const { collectionName, collectionLabel, bricks: rawBricks } = props;
	return {
		collectionName,
		collectionLabel,
		bricks: mapValues(rawBricks, (brick) => {
			const { def, component } = brick;
			return {
				def: {
					name: def.name,
					w: def.w,
					h: def.h,
					label: def.label ?? collectionLabel,
					collectionName,
					collectionLabel,
					order: def.order
				},
				component
			};
		})
	};
}
//#endregion
//#region src/BrickFrame.tsx
function BrickFrame({ backgroundClassName, textClassName, children }) {
	return /* @__PURE__ */ jsx("div", {
		className: `qrk-bricks ${backgroundClassName} ${textClassName} flex h-full w-full select-none items-center justify-center overflow-hidden`,
		children
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircleGraphic.tsx
function BlackCircleGraphic() {
	return /* @__PURE__ */ jsx("div", { className: "h-20 w-20 max-h-[85%] max-w-[85%] shrink-0 rounded-full bg-current" });
}
//#endregion
//#region src/collections/BlackCircle/BlackCircle1x1.tsx
function BlackCircle1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ jsx(BlackCircleGraphic, {})
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircle2x2.tsx
function BlackCircle2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ jsx(BlackCircleGraphic, {})
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircle4x1.tsx
function BlackCircle4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ jsx(BlackCircleGraphic, {})
	});
}
//#endregion
//#region src/collections/BlackCircle/BlackCircleCollection.ts
var blackCircleCollection = makeCollection({
	collectionName: "black-circle",
	collectionLabel: "Black circle",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: BlackCircle1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: BlackCircle2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: BlackCircle4x1
		})
	}
});
//#endregion
//#region src/collections/BlackMLogo/BlackMLogoGraphic.tsx
function BlackMLogoGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("path", {
			d: "M20 70 L20 30 L35 50 L50 30 L50 70 M50 70 L50 30 L65 50 L80 30 L80 70",
			fill: "currentColor"
		})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogo1x1.tsx
function BlackMLogo1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ jsx(BlackMLogoGraphic, {})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogo2x2.tsx
function BlackMLogo2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ jsx(BlackMLogoGraphic, {})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogo4x1.tsx
function BlackMLogo4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#1A1A1A]",
		textClassName: "text-white",
		children: /* @__PURE__ */ jsx(BlackMLogoGraphic, {})
	});
}
//#endregion
//#region src/collections/BlackMLogo/BlackMLogoCollection.ts
var blackMCollection = makeCollection({
	collectionName: "black-m-logo",
	collectionLabel: "Black M",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: BlackMLogo1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: BlackMLogo2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: BlackMLogo4x1
		})
	}
});
//#endregion
//#region src/collections/BlueGrid/BlueGridGraphic.tsx
function BlueGridGraphic() {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: [
			/* @__PURE__ */ jsx("rect", {
				x: "15",
				y: "15",
				width: "30",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "55",
				y: "15",
				width: "30",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "15",
				y: "55",
				width: "30",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
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
function BlueGrid1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#3B7FBD]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(BlueGridGraphic, {})
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGrid2x2.tsx
function BlueGrid2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#3B7FBD]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(BlueGridGraphic, {})
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGrid4x1.tsx
function BlueGrid4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#3B7FBD]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(BlueGridGraphic, {})
	});
}
//#endregion
//#region src/collections/BlueGrid/BlueGridCollection.ts
var blueGridCollection = makeCollection({
	collectionName: "blue-grid",
	collectionLabel: "Blue grid",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: BlueGrid1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: BlueGrid2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: BlueGrid4x1
		})
	}
});
//#endregion
//#region src/collections/CreamBench/CreamBenchGraphic.tsx
function CreamBenchGraphic() {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: [/* @__PURE__ */ jsx("rect", {
			x: "20",
			y: "50",
			width: "25",
			height: "30",
			fill: "currentColor"
		}), /* @__PURE__ */ jsx("rect", {
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
function CreamBench1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(CreamBenchGraphic, {})
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBench2x2.tsx
function CreamBench2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(CreamBenchGraphic, {})
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBench4x1.tsx
function CreamBench4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(CreamBenchGraphic, {})
	});
}
//#endregion
//#region src/collections/CreamBench/CreamBenchCollection.ts
var creamBenchCollection = makeCollection({
	collectionName: "cream-bench",
	collectionLabel: "Cream bench",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: CreamBench1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: CreamBench2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: CreamBench4x1
		})
	}
});
//#endregion
//#region src/collections/CreamSquare/CreamSquareGraphic.tsx
function CreamSquareGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("rect", {
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
function CreamSquare1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(CreamSquareGraphic, {})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquare2x2.tsx
function CreamSquare2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(CreamSquareGraphic, {})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquare4x1.tsx
function CreamSquare4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5F0E6]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(CreamSquareGraphic, {})
	});
}
//#endregion
//#region src/collections/CreamSquare/CreamSquareCollection.ts
var creamSquareCollection = makeCollection({
	collectionName: "cream-square",
	collectionLabel: "Cream square",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: CreamSquare1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: CreamSquare2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: CreamSquare4x1
		})
	}
});
//#endregion
//#region src/collections/Figma/FigmaPromo4x4.tsx
function FigmaPromo4x4() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-neutral-100",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsxs("div", {
			className: "relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg",
			children: [/* @__PURE__ */ jsx(Image, {
				src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png",
				alt: "White Bay Power Station - Historic industrial brick building with Sydney skyline in background",
				className: "absolute inset-0 h-full w-full object-cover",
				layout: "fullWidth",
				height: 800,
				sizes: "(max-width: 768px) 100vw, 50vw"
			}), /* @__PURE__ */ jsxs("div", {
				className: "absolute bottom-0 left-0 right-0 flex items-end justify-between bg-white px-4 py-3",
				children: [/* @__PURE__ */ jsxs("h2", {
					className: "text-2xl font-semibold leading-tight text-black",
					children: [
						"White Bay",
						/* @__PURE__ */ jsx("br", {}),
						"Power Station"
					]
				}), /* @__PURE__ */ jsxs("svg", {
					className: "h-6 w-6 shrink-0",
					viewBox: "0 0 38 57",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					children: [
						/* @__PURE__ */ jsx("path", {
							d: "M19 28.5C19 31.6826 16.4526 34.25 13.2941 34.25H7.58824V22.75H13.2941C16.4526 22.75 19 25.3174 19 28.5Z",
							fill: "#A259FF"
						}),
						/* @__PURE__ */ jsx("path", {
							d: "M7.58824 11.25H13.2941C16.4526 11.25 19 13.8174 19 17C19 20.1826 16.4526 22.75 13.2941 22.75H7.58824V11.25Z",
							fill: "#F24E1E"
						}),
						/* @__PURE__ */ jsx("path", {
							d: "M7.58824 34.25H13.2941C16.4526 34.25 19 36.8174 19 40C19 43.1826 16.4526 45.75 13.2941 45.75H13.2941C10.1357 45.75 7.58824 43.1826 7.58824 40V34.25Z",
							fill: "#0ACF83"
						}),
						/* @__PURE__ */ jsx("path", {
							d: "M19 11.25H24.7059C27.8643 11.25 30.4118 13.8174 30.4118 17C30.4118 20.1826 27.8643 22.75 24.7059 22.75H19V11.25Z",
							fill: "#FF7262"
						}),
						/* @__PURE__ */ jsx("path", {
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
var figmaCollection = makeCollection({
	collectionName: "figma",
	collectionLabel: "Figma",
	bricks: { "4x4": makeBrick({
		name: "4x4",
		w: 4,
		h: 4,
		label: "4×4",
		order: 0,
		component: FigmaPromo4x4
	}) }
});
//#endregion
//#region src/collections/GreenArch/GreenArchGraphic.tsx
function GreenArchGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("path", {
			d: "M20 80 L20 50 Q20 20 50 20 Q80 20 80 50 L80 80 M40 80 L40 50 Q40 40 50 40 Q60 40 60 50 L60 80",
			fill: "currentColor"
		})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArch1x1.tsx
function GreenArch1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenArchGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArch2x2.tsx
function GreenArch2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenArchGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArch4x1.tsx
function GreenArch4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenArchGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenArch/GreenArchCollection.ts
var greenArchCollection = makeCollection({
	collectionName: "green-arch",
	collectionLabel: "Green arch",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: GreenArch1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: GreenArch2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: GreenArch4x1
		})
	}
});
//#endregion
//#region src/utils/cn.ts
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
//#endregion
//#region src/ui/card.tsx
function Card({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card",
		className: cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm", className),
		...props
	});
}
function CardHeader({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card-header",
		className: cn("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", className),
		...props
	});
}
function CardTitle({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card-title",
		className: cn("leading-none font-semibold", className),
		...props
	});
}
function CardContent({ className, ...props }) {
	return /* @__PURE__ */ jsx("div", {
		"data-slot": "card-content",
		className: cn("px-6", className),
		...props
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubAchievementsCard.tsx
var achievements = [
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
function AchievementBadge({ achievement }) {
	return /* @__PURE__ */ jsx("div", {
		className: "flex flex-col items-center gap-1",
		children: /* @__PURE__ */ jsx("div", {
			className: `h-14 w-14 rounded-full bg-gradient-to-br p-0.5 shadow-lg sm:h-16 sm:w-16 md:h-20 md:w-20 ${achievement.gradient}`,
			children: /* @__PURE__ */ jsx("div", {
				className: "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-zinc-900",
				children: /* @__PURE__ */ jsx(Image, {
					src: achievement.image,
					alt: achievement.name,
					width: 64,
					height: 64,
					loading: "eager",
					className: "h-10 w-10 object-contain sm:h-12 sm:w-12 md:h-14 md:w-14"
				})
			})
		})
	});
}
function GitHubAchievementsCard() {
	return /* @__PURE__ */ jsxs(Card, {
		className: "h-full min-h-0 w-full gap-2 overflow-hidden rounded-none border border-zinc-800 bg-zinc-950 py-3 shadow-none",
		children: [/* @__PURE__ */ jsx(CardHeader, {
			className: "shrink-0 px-4 pb-2 pt-0",
			children: /* @__PURE__ */ jsx(CardTitle, {
				className: "text-lg font-semibold text-zinc-100",
				children: "Achievements"
			})
		}), /* @__PURE__ */ jsx(CardContent, {
			className: "min-h-0 flex-1 overflow-auto px-4 pb-4",
			children: /* @__PURE__ */ jsx("div", {
				className: "grid grid-cols-4 gap-2 md:gap-4",
				children: achievements.map((achievement) => /* @__PURE__ */ jsx(AchievementBadge, { achievement }, achievement.id))
			})
		})]
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubAchievements4x2.tsx
function GitHubAchievements4x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-zinc-950",
		textClassName: "text-zinc-100",
		children: /* @__PURE__ */ jsx("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ jsx(GitHubAchievementsCard, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubLanguagesCard.tsx
var GITHUB_REPO_OWNER$1 = "morgs32";
var GITHUB_REPO_NAME$1 = "ink-steps";
var fetcher$2 = (url) => fetch(url).then((res) => res.json());
var languageColors = {
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
};
var getLanguageColor = (language) => {
	return languageColors[language] || "#8b8b8b";
};
function GitHubLanguagesCard() {
	const { data, error, isLoading } = useSWR(`https://api.github.com/repos/${GITHUB_REPO_OWNER$1}/${GITHUB_REPO_NAME$1}/languages`, fetcher$2);
	if (isLoading) return /* @__PURE__ */ jsx(Card, {
		className: "border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none",
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "p-3",
			children: /* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ jsx("div", { className: "bg-muted h-20 w-20 animate-pulse rounded-full" }), /* @__PURE__ */ jsx("div", {
					className: "flex-1 space-y-2",
					children: [...Array(5)].map((_, i) => /* @__PURE__ */ jsx("div", { className: "bg-muted h-3 rounded animate-pulse" }, i))
				})]
			})
		})
	});
	if (error || !data) return /* @__PURE__ */ jsx(Card, {
		className: "border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none",
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "p-3",
			children: /* @__PURE__ */ jsx("p", {
				className: "text-muted-foreground text-xs",
				children: "Failed to load languages"
			})
		})
	});
	const totalBytes = Object.values(data).reduce((acc, val) => acc + val, 0);
	const languages = Object.entries(data).map(([name, bytes]) => ({
		name,
		bytes,
		percentage: Math.round(bytes / totalBytes * 100)
	})).sort((a, b) => b.bytes - a.bytes);
	const threshold = 1;
	const mainLanguages = languages.filter((l) => l.percentage >= threshold);
	const othersPercentage = languages.filter((l) => l.percentage < threshold).reduce((acc, l) => acc + l.percentage, 0);
	const displayLanguages = othersPercentage > 0 ? [...mainLanguages, {
		name: "Others",
		bytes: 0,
		percentage: othersPercentage
	}] : mainLanguages;
	let cumulativePercentage = 0;
	const segments = displayLanguages.map((lang) => {
		const start = cumulativePercentage;
		cumulativePercentage += lang.percentage;
		return {
			...lang,
			start,
			end: cumulativePercentage
		};
	});
	const size = 72;
	const strokeWidth = 12;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	return /* @__PURE__ */ jsx(Card, {
		className: "border-border bg-card h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border py-0 shadow-none",
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "min-h-0 flex-1 overflow-auto p-3",
			children: /* @__PURE__ */ jsxs("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ jsx("div", {
					className: "relative shrink-0",
					children: /* @__PURE__ */ jsx("svg", {
						width: size,
						height: size,
						className: "-rotate-90 transform",
						children: segments.map((segment) => {
							const strokeDasharray = `${segment.percentage / 100 * circumference} ${circumference}`;
							const strokeDashoffset = -(segment.start / 100) * circumference;
							return /* @__PURE__ */ jsx("circle", {
								cx: size / 2,
								cy: size / 2,
								r: radius,
								fill: "none",
								stroke: getLanguageColor(segment.name),
								strokeWidth,
								strokeDasharray,
								strokeDashoffset,
								className: "transition-all duration-300"
							}, segment.name);
						})
					})
				}), /* @__PURE__ */ jsx("div", {
					className: "grid min-w-0 flex-1 grid-cols-1 gap-1",
					children: displayLanguages.map((lang) => /* @__PURE__ */ jsxs("div", {
						className: "flex items-center justify-between text-xs",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex min-w-0 items-center gap-1.5",
							children: [/* @__PURE__ */ jsx("span", {
								className: "h-2.5 w-2.5 shrink-0 rounded-sm",
								style: { backgroundColor: getLanguageColor(lang.name) }
							}), /* @__PURE__ */ jsx("span", {
								className: "text-foreground truncate",
								children: lang.name
							})]
						}), /* @__PURE__ */ jsxs("span", {
							className: "text-muted-foreground shrink-0 tabular-nums",
							children: [lang.percentage, "%"]
						})]
					}, lang.name))
				})]
			})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubLanguages2x2.tsx
function GitHubLanguages2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-card",
		textClassName: "text-card-foreground",
		children: /* @__PURE__ */ jsx("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ jsx(GitHubLanguagesCard, {})
		})
	});
}
//#endregion
//#region src/ui/button.tsx
var buttonVariants = cva("inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
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
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ jsx(asChild ? Slot : "button", {
		"data-slot": "button",
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		...props
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfileCard.tsx
var GITHUB_PROFILE_API_URL = "https://api.github.com/users/morgs32";
var fetcher$1 = (url) => fetch(url).then((res) => res.json());
/** GitHub dark UI — fixed palette so the brick reads dark regardless of app theme. */
var profileCardShellClass = "h-full min-h-0 w-full gap-3 overflow-hidden rounded-none border border-[#30363d] bg-[#0d1117] py-4 text-[#c9d1d9] shadow-none";
var profileMutedClass = "text-[#8b949e]";
var profileHeadingClass = "text-[#f0f6fc]";
function generateContributionData() {
	const weeks = 26;
	const contributions = [];
	for (let week = 0; week < weeks; week++) {
		const weekData = [];
		for (let day = 0; day < 7; day++) {
			const rand = Math.random();
			if (rand < .3) weekData.push(0);
			else if (rand < .5) weekData.push(1);
			else if (rand < .7) weekData.push(2);
			else if (rand < .85) weekData.push(3);
			else weekData.push(4);
		}
		contributions.push(weekData);
	}
	return contributions;
}
/** GitHub contribution graph scale (dark theme). */
var contributionColors = [
	"bg-[#161b22]",
	"bg-[#0e4429]",
	"bg-[#006d32]",
	"bg-[#26a641]",
	"bg-[#39d353]"
];
var months = [
	"Nov",
	"Dec",
	"Jan",
	"Feb",
	"Mar",
	"Apr"
];
var days = [
	"Mon",
	"Wed",
	"Fri"
];
function ContributionGraph() {
	const contributions = generateContributionData();
	return /* @__PURE__ */ jsxs("div", {
		className: "space-y-2",
		children: [/* @__PURE__ */ jsx("p", {
			className: `text-sm ${profileMutedClass}`,
			children: "2,560 contributions in the last year"
		}), /* @__PURE__ */ jsx("div", {
			className: "overflow-x-auto",
			children: /* @__PURE__ */ jsxs("div", {
				className: "inline-block",
				children: [
					/* @__PURE__ */ jsx("div", {
						className: "mb-1 ml-8 flex",
						children: months.map((month) => /* @__PURE__ */ jsx("span", {
							className: `text-xs ${profileMutedClass}`,
							style: { width: `${26 / 6 * 13}px` },
							children: month
						}, month))
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "flex gap-0.5",
						children: [/* @__PURE__ */ jsx("div", {
							className: "flex w-7 flex-col justify-around pr-1",
							children: days.map((day) => /* @__PURE__ */ jsx("span", {
								className: `text-xs leading-3 ${profileMutedClass}`,
								children: day
							}, day))
						}), /* @__PURE__ */ jsx("div", {
							className: "flex gap-[3px]",
							children: contributions.map((week, weekIndex) => /* @__PURE__ */ jsx("div", {
								className: "flex flex-col gap-[3px]",
								children: week.map((level, dayIndex) => /* @__PURE__ */ jsx("div", { className: `h-[11px] w-[11px] rounded-full ${contributionColors[level]}` }, dayIndex))
							}, weekIndex))
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "mt-2 flex items-center justify-end gap-1",
						children: [
							/* @__PURE__ */ jsx("span", {
								className: `mr-1 text-xs ${profileMutedClass}`,
								children: "Less"
							}),
							contributionColors.map((color, i) => /* @__PURE__ */ jsx("div", { className: `h-[11px] w-[11px] rounded-full ${color}` }, i)),
							/* @__PURE__ */ jsx("span", {
								className: `ml-1 text-xs ${profileMutedClass}`,
								children: "More"
							})
						]
					})
				]
			})
		})]
	});
}
function GitHubProfileErrorState(props) {
	const { onRetry } = props;
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "relative mb-3",
			children: [/* @__PURE__ */ jsx("div", { className: "absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-lg" }), /* @__PURE__ */ jsx("div", {
				className: "relative rounded-full border border-red-500/20 bg-red-500/10 p-3",
				children: /* @__PURE__ */ jsx(AlertCircle, {
					className: "h-7 w-7 text-red-400",
					"aria-hidden": true
				})
			})]
		}),
		/* @__PURE__ */ jsxs("div", {
			className: "relative mb-3",
			children: [/* @__PURE__ */ jsx(GitBranch, {
				className: "h-10 w-10 text-zinc-600",
				"aria-hidden": true
			}), /* @__PURE__ */ jsx("div", {
				className: "absolute -bottom-0.5 -right-0.5 rounded-full bg-red-500 p-0.5",
				children: /* @__PURE__ */ jsx(AlertCircle, {
					className: "h-3 w-3 text-white",
					"aria-hidden": true
				})
			})]
		}),
		/* @__PURE__ */ jsx("h2", {
			className: `mb-1.5 text-center text-base font-medium ${profileHeadingClass}`,
			children: "Failed to load GitHub profile"
		}),
		/* @__PURE__ */ jsx("p", {
			className: "mb-4 max-w-[min(100%,16rem)] text-center text-xs text-zinc-500",
			children: "We couldn't fetch the profile data. Please check your connection and try again."
		}),
		/* @__PURE__ */ jsxs(Button, {
			type: "button",
			variant: "outline",
			size: "sm",
			className: "border-zinc-700 bg-transparent text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100",
			onClick: onRetry,
			children: [/* @__PURE__ */ jsx(RefreshCw, { className: "h-4 w-4" }), "Try Again"]
		})
	] });
}
function ProfileAvatar(props) {
	const { src, alt, fallback } = props;
	const [failed, setFailed] = useState(false);
	if (failed || !src) return /* @__PURE__ */ jsx("div", {
		className: "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#21262d] text-sm font-medium text-[#f0f6fc]",
		children: fallback
	});
	return /* @__PURE__ */ jsx(Image, {
		src,
		alt,
		width: 64,
		height: 64,
		className: "h-16 w-16 shrink-0 rounded-full object-cover",
		onError: () => setFailed(true)
	});
}
function GitHubProfileCard() {
	const { data: user, error, isLoading, mutate } = useSWR(GITHUB_PROFILE_API_URL, fetcher$1);
	if (isLoading) return /* @__PURE__ */ jsx(Card, {
		className: profileCardShellClass,
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "p-4",
			children: /* @__PURE__ */ jsx("div", {
				className: "animate-pulse space-y-4",
				children: /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-4",
					children: [/* @__PURE__ */ jsx("div", { className: "h-16 w-16 rounded-full bg-[#21262d]" }), /* @__PURE__ */ jsxs("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ jsx("div", { className: "h-5 w-32 rounded bg-[#21262d]" }), /* @__PURE__ */ jsx("div", { className: "h-4 w-24 rounded bg-[#21262d]" })]
					})]
				})
			})
		})
	});
	if (error || !user || typeof user.login !== "string" || user.login.length === 0) return /* @__PURE__ */ jsx(Card, {
		className: `${profileCardShellClass} flex min-h-0 flex-col`,
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-3 py-4 text-center",
			children: /* @__PURE__ */ jsx(GitHubProfileErrorState, { onRetry: () => void mutate() })
		})
	});
	const displayName = user.name || user.login;
	const avatarFallback = user.login.slice(0, 2).toUpperCase();
	return /* @__PURE__ */ jsxs(Card, {
		className: profileCardShellClass,
		children: [/* @__PURE__ */ jsx(CardHeader, {
			className: "shrink-0 px-4 pb-2 pt-0",
			children: /* @__PURE__ */ jsxs("div", {
				className: "flex items-start gap-4",
				children: [/* @__PURE__ */ jsx(ProfileAvatar, {
					src: typeof user.avatar_url === "string" ? user.avatar_url : "",
					alt: displayName,
					fallback: avatarFallback
				}), /* @__PURE__ */ jsxs("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ jsx("h2", {
							className: `text-xl font-semibold ${profileHeadingClass}`,
							children: displayName
						}),
						/* @__PURE__ */ jsxs("p", {
							className: profileMutedClass,
							children: ["@", user.login]
						}),
						user.bio && /* @__PURE__ */ jsx("p", {
							className: `mt-1 text-sm ${profileMutedClass}`,
							children: user.bio
						})
					]
				})]
			})
		}), /* @__PURE__ */ jsxs(CardContent, {
			className: "min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: `flex flex-wrap gap-4 text-sm ${profileMutedClass}`,
					children: [user.location && /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-1",
						children: [/* @__PURE__ */ jsx(MapPin, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ jsx("span", { children: user.location })]
					}), user.blog && /* @__PURE__ */ jsxs("a", {
						href: user.blog.startsWith("http") ? user.blog : `https://${user.blog}`,
						target: "_blank",
						rel: "noopener noreferrer",
						className: `flex items-center gap-1 transition-colors hover:text-[#58a6ff] ${profileMutedClass}`,
						children: [/* @__PURE__ */ jsx(Link, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ jsx("span", { children: user.blog.replace(/^https?:\/\//, "") })]
					})]
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "flex gap-4 text-sm",
					children: [
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ jsx(Users, { className: `h-4 w-4 shrink-0 ${profileMutedClass}` }),
								/* @__PURE__ */ jsx("span", {
									className: `font-medium ${profileHeadingClass}`,
									children: user.followers
								}),
								/* @__PURE__ */ jsx("span", {
									className: profileMutedClass,
									children: "followers"
								})
							]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ jsx("span", {
								className: `font-medium ${profileHeadingClass}`,
								children: user.following
							}), /* @__PURE__ */ jsx("span", {
								className: profileMutedClass,
								children: "following"
							})]
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-1",
							children: [
								/* @__PURE__ */ jsx(BookOpen, { className: `h-4 w-4 shrink-0 ${profileMutedClass}` }),
								/* @__PURE__ */ jsx("span", {
									className: `font-medium ${profileHeadingClass}`,
									children: user.public_repos
								}),
								/* @__PURE__ */ jsx("span", {
									className: profileMutedClass,
									children: "repos"
								})
							]
						})
					]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "border-t border-[#30363d] pt-2",
					children: /* @__PURE__ */ jsx(ContributionGraph, {})
				})
			]
		})]
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfile4x4.tsx
function GitHubProfile4x4() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#0d1117]",
		textClassName: "text-[#c9d1d9]",
		children: /* @__PURE__ */ jsx("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ jsx(GitHubProfileCard, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubRepoCard.tsx
var GITHUB_REPO_OWNER = "morgs32";
var GITHUB_REPO_NAME = "ink-steps";
var fetcher = (url) => fetch(url).then((res) => res.json());
function GitHubRepoCard() {
	const { data, isLoading } = useSWR(`https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`, fetcher);
	if (isLoading) return /* @__PURE__ */ jsx(Card, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none",
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "p-4",
			children: /* @__PURE__ */ jsxs("div", {
				className: "animate-pulse space-y-3",
				children: [
					/* @__PURE__ */ jsx("div", { className: "h-5 w-1/2 rounded bg-zinc-700" }),
					/* @__PURE__ */ jsx("div", { className: "h-4 w-3/4 rounded bg-zinc-700" }),
					/* @__PURE__ */ jsx("div", { className: "mt-4 h-4 w-1/4 rounded bg-zinc-700" })
				]
			})
		})
	});
	if (!data || data.name === void 0) return /* @__PURE__ */ jsx(Card, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none",
		children: /* @__PURE__ */ jsx(CardContent, {
			className: "p-4",
			children: /* @__PURE__ */ jsx("p", {
				className: "text-zinc-400",
				children: "Repository not found"
			})
		})
	});
	return /* @__PURE__ */ jsx(Card, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-700 bg-zinc-800 py-0 shadow-none transition-colors hover:border-zinc-600",
		children: /* @__PURE__ */ jsx("a", {
			href: data.html_url,
			target: "_blank",
			rel: "noopener noreferrer",
			className: "block h-full min-h-0",
			children: /* @__PURE__ */ jsxs(CardContent, {
				className: "flex h-full min-h-0 flex-col p-4",
				children: [
					/* @__PURE__ */ jsxs("div", {
						className: "mb-2 flex items-center gap-2",
						children: [/* @__PURE__ */ jsx(Monitor, { className: "h-5 w-5 text-zinc-400" }), /* @__PURE__ */ jsx("h3", {
							className: "text-lg font-semibold text-zinc-100",
							children: data.name
						})]
					}),
					/* @__PURE__ */ jsx("p", {
						className: "text-zinc-400 mb-4 min-h-0 flex-1 text-sm",
						children: data.description || "No description provided"
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "text-zinc-400 mt-auto flex items-center gap-4 text-sm",
						children: [
							/* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ jsx(Star, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", { children: data.stargazers_count })]
							}),
							data.forks_count > 0 && /* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ jsx(GitFork, { className: "h-4 w-4" }), /* @__PURE__ */ jsx("span", { children: data.forks_count })]
							}),
							data.language && /* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ jsx("span", { className: "h-3 w-3 rounded-full bg-yellow-400" }), /* @__PURE__ */ jsx("span", { children: data.language })]
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
function GitHubRepo4x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-zinc-900",
		textClassName: "text-zinc-100",
		children: /* @__PURE__ */ jsx("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ jsx(GitHubRepoCard, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubCardsCollection.ts
var githubCardsCollection = makeCollection({
	collectionName: "github-cards",
	collectionLabel: "GitHub",
	bricks: {
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 0,
			component: GitHubProfile4x4
		}),
		"achievements-4x2": makeBrick({
			name: "achievements-4x2",
			w: 4,
			h: 2,
			label: "4×2",
			order: 1,
			component: GitHubAchievements4x2
		}),
		"repo-4x2": makeBrick({
			name: "repo-4x2",
			w: 4,
			h: 2,
			label: "4×2",
			order: 2,
			component: GitHubRepo4x2
		}),
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 3,
			component: GitHubLanguages2x2
		})
	}
});
//#endregion
//#region src/collections/Image/ImagePromo4x4.tsx
function ImagePromo4x4() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-neutral-100",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsxs("div", {
			className: "relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg",
			children: [/* @__PURE__ */ jsx(Image, {
				src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png",
				alt: "White Bay Power Station - Historic industrial brick building with Sydney skyline in background",
				className: "absolute inset-0 h-full w-full object-cover",
				layout: "fullWidth",
				height: 800,
				sizes: "(max-width: 768px) 100vw, 50vw"
			}), /* @__PURE__ */ jsx("div", {
				className: "absolute bottom-0 left-0 right-0 bg-white px-4 py-3",
				children: /* @__PURE__ */ jsxs("h2", {
					className: "text-2xl font-semibold leading-tight text-black",
					children: [
						"White Bay",
						/* @__PURE__ */ jsx("br", {}),
						"Power Station"
					]
				})
			})]
		})
	});
}
//#endregion
//#region src/collections/Image/ImageCollection.ts
var imageCollection = makeCollection({
	collectionName: "image",
	collectionLabel: "Image",
	bricks: { "4x4": makeBrick({
		name: "4x4",
		w: 4,
		h: 4,
		label: "4×4",
		order: 0,
		component: ImagePromo4x4
	}) }
});
//#endregion
//#region src/collections/GreenCross/GreenCrossGraphic.tsx
function GreenCrossGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-12 w-12 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("path", {
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
function GreenCross1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenCrossGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCross2x2.tsx
function GreenCross2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenCrossGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCross4x1.tsx
function GreenCross4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenCrossGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenCross/GreenCrossCollection.ts
var greenCrossCollection = makeCollection({
	collectionName: "green-cross",
	collectionLabel: "Green cross",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: GreenCross1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: GreenCross2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: GreenCross4x1
		})
	}
});
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty1x1.tsx
function GreenEmpty1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty2x2.tsx
function GreenEmpty2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty4x1.tsx
function GreenEmpty4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmptyCollection.ts
var greenEmptyCollection = makeCollection({
	collectionName: "green-empty",
	collectionLabel: "Green empty",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: GreenEmpty1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 0,
			component: GreenEmpty2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: GreenEmpty4x1
		})
	}
});
//#endregion
//#region src/collections/GreenGLogo/GreenGLogoGraphic.tsx
function GreenGLogoGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("path", {
			d: "M70 30 Q30 30 30 50 Q30 70 50 70 L70 70 L70 50 L50 50",
			stroke: "currentColor",
			strokeWidth: "8",
			fill: "none"
		})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogo1x1.tsx
function GreenGLogo1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenGLogoGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogo2x2.tsx
function GreenGLogo2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenGLogoGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogo4x1.tsx
function GreenGLogo4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(GreenGLogoGraphic, {})
	});
}
//#endregion
//#region src/collections/GreenGLogo/GreenGLogoCollection.ts
var greenGCollection = makeCollection({
	collectionName: "green-g-logo",
	collectionLabel: "Green G",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: GreenGLogo1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: GreenGLogo2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: GreenGLogo4x1
		})
	}
});
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocksGraphic.tsx
function OrangeBlocksGraphic() {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: [
			/* @__PURE__ */ jsx("rect", {
				x: "20",
				y: "20",
				width: "30",
				height: "60",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "55",
				y: "20",
				width: "25",
				height: "30",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
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
function OrangeBlocks1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(OrangeBlocksGraphic, {})
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocks2x2.tsx
function OrangeBlocks2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(OrangeBlocksGraphic, {})
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocks4x1.tsx
function OrangeBlocks4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(OrangeBlocksGraphic, {})
	});
}
//#endregion
//#region src/collections/OrangeBlocks/OrangeBlocksCollection.ts
var orangeBlocksCollection = makeCollection({
	collectionName: "orange-block",
	collectionLabel: "Orange blocks",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: OrangeBlocks1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: OrangeBlocks2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: OrangeBlocks4x1
		})
	}
});
//#endregion
//#region src/collections/OrangeFlag/OrangeFlagGraphic.tsx
function OrangeFlagGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("path", {
			d: "M32 37L68 52L32 64",
			fill: "black"
		})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlag1x1.tsx
function OrangeFlag1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(OrangeFlagGraphic, {})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlag2x2.tsx
function OrangeFlag2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(OrangeFlagGraphic, {})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlag4x1.tsx
function OrangeFlag4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#E86F3A]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(OrangeFlagGraphic, {})
	});
}
//#endregion
//#region src/collections/OrangeFlag/OrangeFlagCollection.ts
var orangeFlagCollection = makeCollection({
	collectionName: "orange-flag",
	collectionLabel: "Orange flag",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: OrangeFlag1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: OrangeFlag2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: OrangeFlag4x1
		})
	}
});
//#endregion
//#region src/collections/PinkAsterisk/PinkAsteriskGraphic.tsx
function PinkAsteriskGraphic() {
	return /* @__PURE__ */ jsx("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ jsx("path", {
			d: "M50 20 L50 80 M20 35 L80 65 M20 65 L80 35",
			stroke: "currentColor",
			strokeWidth: "8",
			strokeLinecap: "round"
		})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk1x1.tsx
function PinkAsterisk1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(PinkAsteriskGraphic, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk2x2.tsx
function PinkAsterisk2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(PinkAsteriskGraphic, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk4x1.tsx
function PinkAsterisk4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(PinkAsteriskGraphic, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsteriskCollection.ts
var pinkAsteriskCollection = makeCollection({
	collectionName: "pink-asterisk",
	collectionLabel: "Pink asterisk",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: PinkAsterisk1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: PinkAsterisk2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: PinkAsterisk4x1
		})
	}
});
//#endregion
//#region src/collections/PinkDots/PinkDotsGraphic.tsx
function PinkDotsGraphic() {
	return /* @__PURE__ */ jsx("div", {
		className: "grid max-h-[85%] max-w-[85%] shrink-0 grid-cols-3 gap-3",
		children: [...Array(9)].map((_, index) => /* @__PURE__ */ jsx("div", { className: "h-3 w-3 rounded-full bg-current" }, index))
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDots1x1.tsx
function PinkDots1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(PinkDotsGraphic, {})
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDots2x2.tsx
function PinkDots2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(PinkDotsGraphic, {})
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDots4x1.tsx
function PinkDots4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ jsx(PinkDotsGraphic, {})
	});
}
//#endregion
//#region src/collections/PinkDots/PinkDotsCollection.ts
var pinkDotsCollection = makeCollection({
	collectionName: "pink-dots",
	collectionLabel: "Pink dots",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 1,
			component: PinkDots1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 2,
			component: PinkDots2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 0,
			component: PinkDots4x1
		})
	}
});
//#endregion
//#region src/collections/PurpleLines/PurpleLinesGraphic.tsx
function PurpleLinesGraphic() {
	return /* @__PURE__ */ jsxs("svg", {
		viewBox: "0 0 100 100",
		className: "h-20 w-20 max-h-[85%] max-w-[85%] shrink-0",
		children: [
			/* @__PURE__ */ jsx("rect", {
				x: "20",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "35",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
				x: "50",
				y: "15",
				width: "8",
				height: "70",
				rx: "4",
				fill: "currentColor"
			}),
			/* @__PURE__ */ jsx("rect", {
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
function PurpleLines1x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#8B7BB5]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(PurpleLinesGraphic, {})
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLines2x2.tsx
function PurpleLines2x2() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#8B7BB5]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(PurpleLinesGraphic, {})
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLines4x1.tsx
function PurpleLines4x1() {
	return /* @__PURE__ */ jsx(BrickFrame, {
		backgroundClassName: "bg-[#8B7BB5]",
		textClassName: "text-black",
		children: /* @__PURE__ */ jsx(PurpleLinesGraphic, {})
	});
}
//#endregion
//#region src/collections/PurpleLines/PurpleLinesCollection.ts
var purpleLinesCollection = makeCollection({
	collectionName: "purple-lines",
	collectionLabel: "Purple lines",
	bricks: {
		"2x2": makeBrick({
			name: "2x2",
			w: 2,
			h: 2,
			label: "2×2",
			order: 0,
			component: PurpleLines1x1
		}),
		"4x4": makeBrick({
			name: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 1,
			component: PurpleLines2x2
		}),
		"8x2": makeBrick({
			name: "8x2",
			w: 8,
			h: 2,
			label: "8×2",
			order: 2,
			component: PurpleLines4x1
		})
	}
});
//#endregion
//#region src/collections/TextBrick/TextBrickPresentation.tsx
function TextBrickPresentation({ title, category, w, h }) {
	const isWide = w === 4 && h === 1;
	return /* @__PURE__ */ jsxs("div", {
		className: `select-none flex h-full w-full flex-col justify-center bg-neutral-400 transition-colors duration-200 hover:bg-neutral-100 dark:bg-neutral-700 dark:hover:bg-neutral-500 shadow-[inset_0_1px_0_0_rgb(255_255_255),inset_0_-1px_0_0_rgb(255_255_255)] ${isWide ? "px-4 py-2" : "p-4"}`,
		children: [/* @__PURE__ */ jsx("div", {
			className: `font-medium ${isWide ? "text-sm" : "text-base"}`,
			children: title
		}), /* @__PURE__ */ jsx("div", {
			className: `text-muted-foreground ${isWide ? "text-xs" : "text-sm"}`,
			children: category
		})]
	});
}
//#endregion
//#region src/collections/TextBrick/TextBrick2x2.tsx
function TextBrick2x2() {
	return /* @__PURE__ */ jsx(TextBrickPresentation, {
		title: "Text brick",
		category: "Sample",
		w: 2,
		h: 2
	});
}
//#endregion
//#region src/collections/TextBrick/TextBrick4x1.tsx
function TextBrick4x1() {
	return /* @__PURE__ */ jsx(TextBrickPresentation, {
		title: "Text brick",
		category: "Sample",
		w: 4,
		h: 1
	});
}
//#endregion
//#region src/collectionsHash.ts
var collectionsHash = {
	"orange-flag": orangeFlagCollection,
	"black-circle": blackCircleCollection,
	"green-arch": greenArchCollection,
	"blue-grid": blueGridCollection,
	"cream-bench": creamBenchCollection,
	"green-g-logo": greenGCollection,
	"cream-square": creamSquareCollection,
	"pink-dots": pinkDotsCollection,
	"black-m-logo": blackMCollection,
	"orange-block": orangeBlocksCollection,
	"purple-lines": purpleLinesCollection,
	"pink-asterisk": pinkAsteriskCollection,
	"green-empty": greenEmptyCollection,
	"green-cross": greenCrossCollection,
	"github-cards": githubCardsCollection,
	figma: figmaCollection,
	image: imageCollection,
	"text-brick": makeCollection({
		collectionName: "text-brick",
		collectionLabel: "Text brick",
		bricks: {
			"4x4": makeBrick({
				name: "4x4",
				w: 4,
				h: 4,
				label: "4×4",
				order: 1,
				component: TextBrick2x2
			}),
			"8x2": makeBrick({
				name: "8x2",
				w: 8,
				h: 2,
				label: "8×2",
				order: 0,
				component: TextBrick4x1
			})
		}
	})
};
//#endregion
//#region src/findCollectionBrick.ts
/** Resolve a catalog entry by `collectionName` and brick variant `name` (brick record key). */
function findCollectionBrick(def) {
	const collection = collectionsHash[def.collectionName];
	if (!collection) return void 0;
	return collection.bricks[def.name];
}
//#endregion
export { collectionsHash as n, findCollectionBrick as t };
