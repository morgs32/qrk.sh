import { Links, Meta, Outlet, Scripts } from "react-router";
import { ClerkProvider } from "@clerk/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "./globals.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Platforms Starter Kit</title>
        <link rel="icon" href="/app-static/favicon.ico" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <p role="status">Loading workspace…</p>;
}

export default function App() {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!clerkPublishableKey)
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for the app.");
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/replace"
      signUpFallbackRedirectUrl="/replace"
      appearance={{
        elements: { userButtonPopoverActionButtonIcon: "!size-5" },
        variables: { fontSize: "1rem" },
      }}
    >
      <NuqsAdapter>
        <MotionConfig reducedMotion="user">
          <Outlet />
        </MotionConfig>
      </NuqsAdapter>
      <SpeedInsights />
      <Toaster />
    </ClerkProvider>
  );
}
