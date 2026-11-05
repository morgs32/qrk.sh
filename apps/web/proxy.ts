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
