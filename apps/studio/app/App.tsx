"use client";

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";

export default function App(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/replace"
      signUpFallbackRedirectUrl="/replace"
      appearance={{
        elements: { userButtonPopoverActionButtonIcon: "!size-5" },
        variables: { fontSize: "1rem" },
      }}
    >
      <NuqsAdapter>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </NuqsAdapter>
      <SpeedInsights />
      <Toaster />
    </ClerkProvider>
  );
}
