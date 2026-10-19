import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const webOrigin = process.env.NEXT_PUBLIC_WEB_ORIGIN;
    if (!webOrigin) throw new Error("NEXT_PUBLIC_WEB_ORIGIN is required");
    throw redirect({ href: new URL("/replace", webOrigin).href, replace: true });
  },
});
