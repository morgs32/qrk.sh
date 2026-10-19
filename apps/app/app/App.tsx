"use client";

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";

export default function App(props: { children: ReactNode }) {
  const { children } = props;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required");
  const webOrigin = process.env.NEXT_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) throw new Error("NEXT_PUBLIC_WEB_ORIGIN is required");
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      allowedRedirectOrigins={[webOrigin]}
      isSatellite={import.meta.env.DEV}
      domain={import.meta.env.DEV ? "app.qrk.localhost" : undefined}
      satelliteAutoSync={import.meta.env.DEV}
      signInUrl={new URL("/sign-in", webOrigin).href}
      signUpUrl={new URL("/sign-up", webOrigin).href}
      afterSignOutUrl={new URL("/", webOrigin).href}
      signInFallbackRedirectUrl={new URL("/replace", webOrigin).href}
      signUpFallbackRedirectUrl={new URL("/replace", webOrigin).href}
      appearance={{
        elements: { userButtonPopoverActionButtonIcon: "!size-5" },
        variables: { fontSize: "1rem" },
      }}
    >
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      <SpeedInsights />
      <Toaster />
    </ClerkProvider>
  );
}
