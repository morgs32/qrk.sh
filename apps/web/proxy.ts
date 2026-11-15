import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/privacy",
  "/terms",
  "/ordered-outline",
]);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  if (isPublicRoute(request) || pathname.startsWith("/assets/")) return NextResponse.next();
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;
  if (/^\/__dev(?:\/|$)/.test(pathname)) {
    if (process.env.NODE_ENV !== "development")
      return new NextResponse("Not found", { status: 404 });
    return NextResponse.next();
  }
  if (
    process.env.NODE_ENV === "development" &&
    (request.method === "GET" || request.method === "HEAD") &&
    !/^\/(?:api|trpc|rpc)(?:\/|$)/.test(pathname)
  ) {
    const hostname = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
    const suffix = ".qrk.localhost";
    if (hostname.endsWith(suffix)) {
      const label = hostname.slice(0, -suffix.length);
      if (!label.includes(".") && !["admin", "app", "api", "bricks", "zerospin", "studio", "storybook"].includes(label)) {
        const separator = label.lastIndexOf("-");
        const site = label.slice(0, separator);
        const username = label.slice(separator + 1);
        if (
          label.length > 63 ||
          separator < 1 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(site) ||
          !/^[a-z0-9]+$/.test(username)
        ) {
          return new NextResponse("Not found", { status: 404 });
        }
        const destination = request.nextUrl.clone();
        destination.pathname = `/published/${label}${pathname === "/" ? "" : pathname}`;
        const response = NextResponse.rewrite(destination);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
    }
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    // Published Page paths can legitimately end in a file-like suffix.
    {
      source: "/((?!_next|assets/).*)",
      has: [{ type: "header", key: "host", value: ".+-[a-zA-Z0-9]+\\.qrk\\.localhost(?::[0-9]+)?" }],
    },
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|assets/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|wasm|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
