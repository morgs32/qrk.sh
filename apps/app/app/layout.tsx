import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Space_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Platforms Starter Kit",
  description: "Next.js app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${spaceMono.variable} antialiased`}>
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
        >
          <NuqsAdapter>{children}</NuqsAdapter>
        </ClerkProvider>
        <SpeedInsights />
        <Toaster />
      </body>
    </html>
  );
}
