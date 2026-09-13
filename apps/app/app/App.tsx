import { Outlet } from "react-router";
import { ClerkProvider } from "@clerk/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "./globals.css";

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
