import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { postAuthPath } from "@/app/(site)/site/[siteId]/routePatterns";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      <body className={`${geistSans.variable} antialiased`}>
        <ClerkProvider signInFallbackRedirectUrl={postAuthPath} signUpFallbackRedirectUrl={postAuthPath}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ClerkProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
