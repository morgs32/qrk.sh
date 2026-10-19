import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Space_Mono, Silkscreen } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "QRK.SH",
  description: "Loud and proud, right? Right.",
};

export default function RootLayout(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  const { children } = props;
  const appOrigin = new URL(
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
      (process.env.NODE_ENV === "production"
        ? "https://app.qrk.sh"
        : "https://app.qrk.localhost"),
  ).origin;

  return (
    <html lang="en">
      <body className={`${spaceMono.variable} ${silkscreen.variable} font-sans antialiased`}>
        <ClerkProvider
          appearance={{
            elements: {
              userButtonPopoverActionButtonIcon: "!size-5",
            },
            variables: {
              fontSize: "1rem",
            },
          }}
          signInFallbackRedirectUrl="/replace"
          signUpFallbackRedirectUrl="/replace"
          allowedRedirectOrigins={[appOrigin]}
        >
          {children}
        </ClerkProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
