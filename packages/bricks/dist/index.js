import { mapValues as e } from "es-toolkit/object";
import { Image as t } from "@unpic/react";
import { Fragment as n, jsx as r, jsxs as i } from "react/jsx-runtime";
import { useState as a } from "react";
import { ActivityCalendar as o } from "react-activity-calendar";
import s from "swr";
import { AlertCircle as c, BookOpen as l, GitBranch as u, GitFork as d, Link as f, MapPin as p, Monitor as m, Quote as h, RefreshCw as g, Star as _, Users as v } from "lucide-react";
import { Slot as y } from "@radix-ui/react-slot";
import { cva as ee } from "class-variance-authority";
import { clsx as te } from "clsx";
import { twMerge as ne } from "tailwind-merge";
//#region src/makeCollection.ts
function b(t) {
	let { collectionName: n, collectionLabel: r, collectionDescription: i, variants: a } = t;
	return {
		collectionName: n,
		collectionLabel: r,
		collectionDescription: i,
		variants: e(a, (t) => ({
			variantDescription: t.variantDescription,
			sizes: e(t.sizes, (e) => ({
				def: {
					collectionName: n,
					collectionLabel: r,
					variant: e.def.variant,
					size: e.def.size,
					w: e.def.w,
					h: e.def.h,
					label: e.def.label,
					order: e.def.order
				},
				component: e.component
			}))
		}))
	};
}
//#endregion
//#region src/makeVariant.ts
function x(e) {
	return {
		variantDescription: e.variantDescription,
		sizes: e.sizes
	};
}
//#endregion
//#region src/makeBrick.ts
var S = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function C(e) {
	let { variant: t, size: n, w: r, h: i, order: a, label: o, component: s } = e;
	if (!S.test(e.variant)) throw Error(`makeBrick: variant must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(e.variant)}`);
	if (!S.test(e.size)) throw Error(`makeBrick: size must be kebab-case (lowercase segments separated by hyphens); got ${JSON.stringify(e.size)}`);
	return {
		def: {
			variant: t,
			size: n,
			w: r,
			h: i,
			order: a,
			label: o
		},
		component: s
	};
}
//#endregion
//#region src/BrickFrame.tsx
function w({ backgroundClassName: e, textClassName: t, children: n }) {
	return /* @__PURE__ */ r("div", {
		className: `qrk-bricks ${e} ${t} flex h-full w-full select-none items-center justify-center overflow-hidden`,
		children: n
	});
}
//#endregion
//#region src/collections/Figma/FigmaPromo4x4.tsx
function T() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-neutral-100",
		textClassName: "text-black",
		children: /* @__PURE__ */ i("div", {
			className: "relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg",
			children: [/* @__PURE__ */ r(t, {
				src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png",
				alt: "White Bay Power Station - Historic industrial brick building with Sydney skyline in background",
				className: "absolute inset-0 h-full w-full object-cover",
				layout: "fullWidth",
				height: 800,
				sizes: "(max-width: 768px) 100vw, 50vw"
			}), /* @__PURE__ */ i("div", {
				className: "absolute bottom-0 left-0 right-0 flex items-end justify-between bg-white px-4 py-3",
				children: [/* @__PURE__ */ i("h2", {
					className: "text-2xl font-semibold leading-tight text-black",
					children: [
						"White Bay",
						/* @__PURE__ */ r("br", {}),
						"Power Station"
					]
				}), /* @__PURE__ */ i("svg", {
					className: "h-6 w-6 shrink-0",
					viewBox: "0 0 38 57",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					children: [
						/* @__PURE__ */ r("path", {
							d: "M19 28.5C19 31.6826 16.4526 34.25 13.2941 34.25H7.58824V22.75H13.2941C16.4526 22.75 19 25.3174 19 28.5Z",
							fill: "#A259FF"
						}),
						/* @__PURE__ */ r("path", {
							d: "M7.58824 11.25H13.2941C16.4526 11.25 19 13.8174 19 17C19 20.1826 16.4526 22.75 13.2941 22.75H7.58824V11.25Z",
							fill: "#F24E1E"
						}),
						/* @__PURE__ */ r("path", {
							d: "M7.58824 34.25H13.2941C16.4526 34.25 19 36.8174 19 40C19 43.1826 16.4526 45.75 13.2941 45.75H13.2941C10.1357 45.75 7.58824 43.1826 7.58824 40V34.25Z",
							fill: "#0ACF83"
						}),
						/* @__PURE__ */ r("path", {
							d: "M19 11.25H24.7059C27.8643 11.25 30.4118 13.8174 30.4118 17C30.4118 20.1826 27.8643 22.75 24.7059 22.75H19V11.25Z",
							fill: "#FF7262"
						}),
						/* @__PURE__ */ r("path", {
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
var E = b({
	collectionName: "figma",
	collectionLabel: "Figma",
	collectionDescription: "A preview of a Figma project.",
	variants: { default: x({
		variant: "default",
		variantDescription: "A preview of a Figma project.",
		sizes: { "4x4": C({
			variant: "default",
			size: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 0,
			component: T
		}) }
	}) }
});
//#endregion
//#region src/utils/cn.ts
function D(...e) {
	return ne(te(e));
}
//#endregion
//#region src/ui/button.tsx
var O = ee("inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive", {
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
function k({ className: e, variant: t, size: n, asChild: i = !1, ...a }) {
	return /* @__PURE__ */ r(i ? y : "button", {
		"data-slot": "button",
		className: D(O({
			variant: t,
			size: n,
			className: e
		})),
		...a
	});
}
//#endregion
//#region src/ui/card.tsx
function A({ className: e, ...t }) {
	return /* @__PURE__ */ r("div", {
		"data-slot": "card",
		className: D("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm", e),
		...t
	});
}
function j({ className: e, ...t }) {
	return /* @__PURE__ */ r("div", {
		"data-slot": "card-header",
		className: D("@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", e),
		...t
	});
}
function M({ className: e, ...t }) {
	return /* @__PURE__ */ r("div", {
		"data-slot": "card-content",
		className: D("px-6", e),
		...t
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfileCard.tsx
var N = "https://api.github.com/users/morgs32", P = (e) => fetch(e).then((e) => e.json()), F = "h-full min-h-0 w-full gap-1 overflow-hidden rounded-none border border-zinc-200 bg-white py-3 text-zinc-900 shadow-none", I = "text-zinc-500", L = "text-zinc-950";
function R() {
	let e = /* @__PURE__ */ new Date("2025-11-02T00:00:00.000Z"), t = [];
	for (let n = 0; n < 182; n++) {
		let r = new Date(e);
		r.setUTCDate(e.getUTCDate() + n);
		let i = (n * 7 + n % 6) % 5;
		t.push({
			date: r.toISOString().slice(0, 10),
			count: i * 3,
			level: i
		});
	}
	return t;
}
function z() {
	return /* @__PURE__ */ r("div", { children: /* @__PURE__ */ r(o, {
		data: R(),
		blockMargin: 2,
		blockSize: 9,
		colorScheme: "light",
		fontSize: 10,
		showTotalCount: !1,
		showWeekdayLabels: [
			"mon",
			"wed",
			"fri"
		]
	}) });
}
function re(e) {
	let { onRetry: t } = e;
	return /* @__PURE__ */ i(n, { children: [
		/* @__PURE__ */ i("div", {
			className: "relative mb-3",
			children: [/* @__PURE__ */ r("div", { className: "absolute inset-0 animate-pulse rounded-full bg-red-500/20 blur-lg" }), /* @__PURE__ */ r("div", {
				className: "relative rounded-full border border-red-500/20 bg-red-500/10 p-3",
				children: /* @__PURE__ */ r(c, {
					className: "h-7 w-7 text-red-400",
					"aria-hidden": !0
				})
			})]
		}),
		/* @__PURE__ */ i("div", {
			className: "relative mb-3",
			children: [/* @__PURE__ */ r(u, {
				className: "h-10 w-10 text-zinc-600",
				"aria-hidden": !0
			}), /* @__PURE__ */ r("div", {
				className: "absolute -bottom-0.5 -right-0.5 rounded-full bg-red-500 p-0.5",
				children: /* @__PURE__ */ r(c, {
					className: "h-3 w-3 text-white",
					"aria-hidden": !0
				})
			})]
		}),
		/* @__PURE__ */ r("h2", {
			className: `mb-1.5 text-center text-base font-medium ${L}`,
			children: "Failed to load GitHub profile"
		}),
		/* @__PURE__ */ r("p", {
			className: "mb-4 max-w-[min(100%,16rem)] text-center text-xs text-zinc-500",
			children: "We couldn't fetch the profile data. Please check your connection and try again."
		}),
		/* @__PURE__ */ i(k, {
			type: "button",
			variant: "outline",
			size: "sm",
			className: "border-zinc-300 bg-white text-zinc-700 transition-all hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950",
			onClick: t,
			children: [/* @__PURE__ */ r(g, { className: "h-4 w-4" }), "Try Again"]
		})
	] });
}
function B(e) {
	let { src: n, alt: i, fallback: o } = e, [s, c] = a(!1);
	return s || !n ? /* @__PURE__ */ r("div", {
		className: "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-900",
		children: o
	}) : /* @__PURE__ */ r(t, {
		src: n,
		alt: i,
		width: 64,
		height: 64,
		className: "h-16 w-16 shrink-0 rounded-full object-cover",
		onError: () => c(!0)
	});
}
function V() {
	let { data: e, error: t, isLoading: n, mutate: a } = s(N, P);
	if (n) return /* @__PURE__ */ r(A, {
		className: F,
		children: /* @__PURE__ */ r(M, {
			className: "p-4",
			children: /* @__PURE__ */ r("div", {
				className: "animate-pulse space-y-4",
				children: /* @__PURE__ */ i("div", {
					className: "flex items-center gap-4",
					children: [/* @__PURE__ */ r("div", { className: "h-16 w-16 rounded-full bg-zinc-200" }), /* @__PURE__ */ i("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ r("div", { className: "h-5 w-32 rounded bg-zinc-200" }), /* @__PURE__ */ r("div", { className: "h-4 w-24 rounded bg-zinc-200" })]
					})]
				})
			})
		})
	});
	if (t || !e || typeof e.login != "string" || e.login.length === 0) return /* @__PURE__ */ r(A, {
		className: `${F} flex min-h-0 flex-col`,
		children: /* @__PURE__ */ r(M, {
			className: "flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-3 py-4 text-center",
			children: /* @__PURE__ */ r(re, { onRetry: () => void a() })
		})
	});
	let o = e.name || e.login, c = e.login.slice(0, 2).toUpperCase();
	return /* @__PURE__ */ i(A, {
		className: F,
		children: [/* @__PURE__ */ r(j, {
			className: "shrink-0 px-4 pb-0 pt-0",
			children: /* @__PURE__ */ i("div", {
				className: "flex items-center gap-4",
				children: [/* @__PURE__ */ r(B, {
					src: typeof e.avatar_url == "string" ? e.avatar_url : "",
					alt: o,
					fallback: c
				}), /* @__PURE__ */ i("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ r("h2", {
						className: `text-xl font-semibold ${L}`,
						children: o
					}), /* @__PURE__ */ i("p", {
						className: I,
						children: ["@", e.login]
					})]
				})]
			})
		}), /* @__PURE__ */ i(M, {
			className: "flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-4 pb-2",
			children: [/* @__PURE__ */ i("div", {
				className: `flex flex-col gap-2 text-sm ${I}`,
				children: [
					e.bio && /* @__PURE__ */ i("div", {
						className: "flex items-center gap-1",
						children: [/* @__PURE__ */ r(h, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ r("span", { children: e.bio })]
					}),
					e.location && /* @__PURE__ */ i("div", {
						className: "flex items-center gap-1",
						children: [/* @__PURE__ */ r(p, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ r("span", { children: e.location })]
					}),
					e.blog && /* @__PURE__ */ i("a", {
						href: e.blog.startsWith("http") ? e.blog : `https://${e.blog}`,
						target: "_blank",
						rel: "noopener noreferrer",
						className: `flex items-center gap-1 transition-colors hover:text-blue-600 ${I}`,
						children: [/* @__PURE__ */ r(f, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ r("span", { children: e.blog.replace(/^https?:\/\//, "") })]
					}),
					/* @__PURE__ */ i("div", {
						className: "flex gap-4 text-sm",
						children: [
							/* @__PURE__ */ i("div", {
								className: "flex items-center gap-1",
								children: [
									/* @__PURE__ */ r(v, { className: `h-4 w-4 shrink-0 ${I}` }),
									/* @__PURE__ */ r("span", {
										className: `font-medium ${L}`,
										children: e.followers
									}),
									/* @__PURE__ */ r("span", {
										className: I,
										children: "followers"
									})
								]
							}),
							/* @__PURE__ */ i("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ r("span", {
									className: `font-medium ${L}`,
									children: e.following
								}), /* @__PURE__ */ r("span", {
									className: I,
									children: "following"
								})]
							}),
							/* @__PURE__ */ i("div", {
								className: "flex items-center gap-1",
								children: [
									/* @__PURE__ */ r(l, { className: `h-4 w-4 shrink-0 ${I}` }),
									/* @__PURE__ */ r("span", {
										className: `font-medium ${L}`,
										children: e.public_repos
									}),
									/* @__PURE__ */ r("span", {
										className: I,
										children: "repos"
									})
								]
							})
						]
					})
				]
			}), /* @__PURE__ */ r("div", {
				className: "mt-auto",
				children: /* @__PURE__ */ r(z, {})
			})]
		})]
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfile4x4.tsx
function H() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-white",
		textClassName: "text-zinc-950",
		children: /* @__PURE__ */ r("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ r(V, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubRepoCard.tsx
var U = "morgs32", W = "ink-steps", G = (e) => fetch(e).then((e) => e.json());
function K() {
	let { data: e, isLoading: t } = s(`https://api.github.com/repos/${U}/${W}`, G);
	return t ? /* @__PURE__ */ r(A, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-200 bg-white py-0 shadow-none",
		children: /* @__PURE__ */ r(M, {
			className: "p-4",
			children: /* @__PURE__ */ i("div", {
				className: "animate-pulse space-y-3",
				children: [
					/* @__PURE__ */ r("div", { className: "h-5 w-1/2 rounded bg-zinc-200" }),
					/* @__PURE__ */ r("div", { className: "h-4 w-3/4 rounded bg-zinc-200" }),
					/* @__PURE__ */ r("div", { className: "mt-4 h-4 w-1/4 rounded bg-zinc-200" })
				]
			})
		})
	}) : !e || e.name === void 0 ? /* @__PURE__ */ r(A, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-200 bg-white py-0 shadow-none",
		children: /* @__PURE__ */ r(M, {
			className: "p-4",
			children: /* @__PURE__ */ r("p", {
				className: "text-zinc-500",
				children: "Repository not found"
			})
		})
	}) : /* @__PURE__ */ r(A, {
		className: "h-full min-h-0 w-full gap-0 overflow-hidden rounded-none border border-zinc-200 bg-white py-0 shadow-none transition-colors hover:border-zinc-300",
		children: /* @__PURE__ */ r("a", {
			href: e.html_url,
			target: "_blank",
			rel: "noopener noreferrer",
			className: "block h-full min-h-0",
			children: /* @__PURE__ */ i(M, {
				className: "flex h-full min-h-0 flex-col p-4",
				children: [
					/* @__PURE__ */ i("div", {
						className: "mb-2 flex items-center gap-2",
						children: [/* @__PURE__ */ r(m, { className: "h-5 w-5 text-zinc-500" }), /* @__PURE__ */ r("h3", {
							className: "text-lg font-semibold text-zinc-950",
							children: e.name
						})]
					}),
					/* @__PURE__ */ r("p", {
						className: "text-zinc-500 mb-4 min-h-0 flex-1 text-sm",
						children: e.description || "No description provided"
					}),
					/* @__PURE__ */ i("div", {
						className: "text-zinc-500 mt-auto flex items-center gap-4 text-sm",
						children: [
							/* @__PURE__ */ i("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ r(_, { className: "h-4 w-4" }), /* @__PURE__ */ r("span", { children: e.stargazers_count })]
							}),
							e.forks_count > 0 && /* @__PURE__ */ i("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ r(d, { className: "h-4 w-4" }), /* @__PURE__ */ r("span", { children: e.forks_count })]
							}),
							e.language && /* @__PURE__ */ i("div", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ r("span", { className: "h-3 w-3 rounded-full bg-yellow-400" }), /* @__PURE__ */ r("span", { children: e.language })]
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
function q() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-white",
		textClassName: "text-zinc-950",
		children: /* @__PURE__ */ r("div", {
			className: "flex h-full w-full min-h-0 items-stretch justify-stretch",
			children: /* @__PURE__ */ r(K, {})
		})
	});
}
//#endregion
//#region src/collections/GitHubCards/GitHubProfileCollection.ts
var J = b({
	collectionName: "github",
	collectionLabel: "GitHub",
	collectionDescription: "Profile and repository cards from GitHub.",
	variants: {
		profile: x({
			variant: "profile",
			variantDescription: "A GitHub profile card.",
			sizes: { "4x4": C({
				variant: "profile",
				size: "4x4",
				w: 4,
				h: 4,
				label: "4×4",
				order: 0,
				component: H
			}) }
		}),
		repo: x({
			variant: "repo",
			variantDescription: "A GitHub repository card.",
			sizes: { "4x2": C({
				variant: "repo",
				size: "4x2",
				w: 4,
				h: 2,
				label: "4×2",
				order: 1,
				component: q
			}) }
		})
	}
});
//#endregion
//#region src/collections/Image/ImagePromo4x4.tsx
function Y() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-neutral-100",
		textClassName: "text-black",
		children: /* @__PURE__ */ i("div", {
			className: "relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg",
			children: [/* @__PURE__ */ r(t, {
				src: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-R5Rxc1njvx1TxZvdhpup2fzOmNaENd.png",
				alt: "White Bay Power Station - Historic industrial brick building with Sydney skyline in background",
				className: "absolute inset-0 h-full w-full object-cover",
				layout: "fullWidth",
				height: 800,
				sizes: "(max-width: 768px) 100vw, 50vw"
			}), /* @__PURE__ */ r("div", {
				className: "absolute bottom-0 left-0 right-0 bg-white px-4 py-3",
				children: /* @__PURE__ */ i("h2", {
					className: "text-2xl font-semibold leading-tight text-black",
					children: [
						"White Bay",
						/* @__PURE__ */ r("br", {}),
						"Power Station"
					]
				})
			})]
		})
	});
}
//#endregion
//#region src/collections/Image/ImageCollection.ts
var X = b({
	collectionName: "image",
	collectionLabel: "Image",
	collectionDescription: "An editorial image preview.",
	variants: { default: x({
		variant: "default",
		variantDescription: "An editorial image preview.",
		sizes: { "4x4": C({
			variant: "default",
			size: "4x4",
			w: 4,
			h: 4,
			label: "4×4",
			order: 0,
			component: Y
		}) }
	}) }
});
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty1x1.tsx
function ie() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty2x2.tsx
function ae() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmpty4x1.tsx
function oe() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-[#4A7C59]",
		textClassName: "text-black"
	});
}
//#endregion
//#region src/collections/GreenEmpty/GreenEmptyCollection.ts
var se = b({
	collectionName: "swatch",
	collectionLabel: "Swatch",
	collectionDescription: "Solid color fields for visual rhythm.",
	variants: { default: x({
		variant: "default",
		variantDescription: "A solid color field.",
		sizes: {
			"2x2": C({
				variant: "default",
				size: "2x2",
				w: 2,
				h: 2,
				label: "2×2",
				order: 1,
				component: ie
			}),
			"4x4": C({
				variant: "default",
				size: "4x4",
				w: 4,
				h: 4,
				label: "4×4",
				order: 0,
				component: ae
			}),
			"8x2": C({
				variant: "default",
				size: "8x2",
				w: 8,
				h: 2,
				label: "8×2",
				order: 2,
				component: oe
			})
		}
	}) }
});
//#endregion
//#region src/collections/PinkAsterisk/PinkAsteriskGraphic.tsx
function Z() {
	return /* @__PURE__ */ r("svg", {
		viewBox: "0 0 100 100",
		className: "h-16 w-16 max-h-[85%] max-w-[85%] shrink-0",
		children: /* @__PURE__ */ r("path", {
			d: "M50 20 L50 80 M20 35 L80 65 M20 65 L80 35",
			stroke: "currentColor",
			strokeWidth: "8",
			strokeLinecap: "round"
		})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk1x1.tsx
function Q() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ r(Z, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk2x2.tsx
function ce() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ r(Z, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsterisk4x1.tsx
function le() {
	return /* @__PURE__ */ r(w, {
		backgroundClassName: "bg-[#F5D6D0]",
		textClassName: "text-foreground",
		children: /* @__PURE__ */ r(Z, {})
	});
}
//#endregion
//#region src/collections/PinkAsterisk/PinkAsteriskCollection.ts
var ue = b({
	collectionName: "icon",
	collectionLabel: "Icon",
	collectionDescription: "Graphic icons for your grid.",
	variants: { default: x({
		variant: "default",
		variantDescription: "A graphic asterisk icon.",
		sizes: {
			"2x2": C({
				variant: "default",
				size: "2x2",
				w: 2,
				h: 2,
				label: "2×2",
				order: 1,
				component: Q
			}),
			"4x4": C({
				variant: "default",
				size: "4x4",
				w: 4,
				h: 4,
				label: "4×4",
				order: 2,
				component: ce
			}),
			"8x2": C({
				variant: "default",
				size: "8x2",
				w: 8,
				h: 2,
				label: "8×2",
				order: 0,
				component: le
			})
		}
	}) }
});
//#endregion
//#region src/collections/TextBrick/TextBrickPresentation.tsx
function $({ title: e, category: t, w: n, h: a }) {
	let o = n === 4 && a === 1;
	return /* @__PURE__ */ i("div", {
		className: `select-none flex h-full w-full flex-col justify-center bg-neutral-400 transition-colors duration-200 hover:bg-neutral-100 dark:bg-neutral-700 dark:hover:bg-neutral-500 shadow-[inset_0_1px_0_0_rgb(255_255_255),inset_0_-1px_0_0_rgb(255_255_255)] ${o ? "px-4 py-2" : "p-4"}`,
		children: [/* @__PURE__ */ r("div", {
			className: `font-medium ${o ? "text-sm" : "text-base"}`,
			children: e
		}), /* @__PURE__ */ r("div", {
			className: `text-muted-foreground ${o ? "text-xs" : "text-sm"}`,
			children: t
		})]
	});
}
//#endregion
//#region src/collections/TextBrick/TextBrick2x2.tsx
function de() {
	return /* @__PURE__ */ r($, {
		title: "Text brick",
		category: "Sample",
		w: 2,
		h: 2
	});
}
//#endregion
//#region src/collections/TextBrick/TextBrick4x1.tsx
function fe() {
	return /* @__PURE__ */ r($, {
		title: "Text brick",
		category: "Sample",
		w: 4,
		h: 1
	});
}
//#endregion
//#region src/collectionsHash.ts
var pe = {
	icon: ue,
	swatch: se,
	github: J,
	figma: E,
	image: X,
	"text-brick": b({
		collectionName: "text-brick",
		collectionLabel: "Text brick",
		collectionDescription: "Text blocks for grid content.",
		variants: { default: x({
			variant: "default",
			variantDescription: "A text content block.",
			sizes: {
				"4x4": C({
					variant: "default",
					size: "4x4",
					w: 4,
					h: 4,
					label: "4×4",
					order: 1,
					component: de
				}),
				"8x2": C({
					variant: "default",
					size: "8x2",
					w: 8,
					h: 2,
					label: "8×2",
					order: 0,
					component: fe
				})
			}
		}) }
	})
};
//#endregion
export { pe as collectionsHash };
