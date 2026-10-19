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
  if (
    process.env.NODE_ENV === "development" &&
    (request.method === "GET" || request.method === "HEAD") &&
    !/^\/(api|trpc|rpc)(\/|$)/.test(pathname)
  ) {
    const hostname = request.headers.get("host")?.toLowerCase().replace(/:\d+$/, "");
    const subdomain = hostname?.match(
      /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.qrk\.localhost$/,
    )?.[1];
    if (subdomain) {
      const destination = request.nextUrl.clone();
      destination.pathname = `/subdomain-proof/${subdomain}${pathname}`;
      return NextResponse.rewrite(destination);
    }
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|assets/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|wasm|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
