import { createClerkClient } from "@clerk/backend";
import { next } from "@vercel/functions";

export const config = {
  matcher: ["/((?!assets/|api/|rpc(?:/|$)|__dev(?:/|$)).*)"],
};

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const isDocument =
    (request.method === "GET" || request.method === "HEAD") &&
    (request.headers.get("sec-fetch-dest") === "document" ||
      request.headers.get("accept")?.includes("text/html"));

  if (
    !isDocument ||
    url.pathname === "/" ||
    /\.(?:html|js|css|wasm|json|ico|png|svg|woff2?)$/i.test(url.pathname) ||
    /^\/(?:assets|api|rpc|__dev|sign-in|sign-up)(?:\/|$)/.test(url.pathname)
  ) {
    return next();
  }

  const { CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY } = process.env;
  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
  const webOrigin = process.env.NEXT_PUBLIC_WEB_ORIGIN;
  if (!CLERK_SECRET_KEY || !NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !appOrigin || !webOrigin) {
    throw new Error("Configure Clerk and the QRK App and Web origins for document authentication.");
  }

  const app = new URL(appOrigin);
  const web = new URL(webOrigin);
  if (url.origin !== app.origin) {
    return new Response("Not found", { status: 404 });
  }

  const clerk = createClerkClient({
    secretKey: CLERK_SECRET_KEY,
    publishableKey: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const isSatellite = app.hostname.endsWith(".localhost");
  const state = await clerk.authenticateRequest(request, {
    acceptsToken: "session_token",
    authorizedParties: [app.origin, web.origin],
    signInUrl: new URL("/sign-in", web).href,
    ...(isSatellite ? { isSatellite, domain: app.hostname, satelliteAutoSync: true } : {}),
  });

  const headers = new Headers(state.headers);
  headers.set("Cache-Control", "private, no-store");
  if (headers.has("Location")) return new Response(null, { status: 307, headers });
  if (state.status === "handshake") {
    throw new Error("Clerk handshake is missing its redirect.");
  }
  if (state.toAuth().userId) return next({ headers });

  const signIn = new URL("/sign-in", web);
  const returnTo = new URL(app.origin);
  returnTo.pathname = url.pathname;
  returnTo.search = url.search;
  signIn.searchParams.set("redirect_url", returnTo.href);
  headers.set("Location", signIn.href);
  return new Response(null, { status: 302, headers });
}
