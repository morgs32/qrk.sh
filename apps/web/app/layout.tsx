import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Space_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "QRK.SH",
  description: "Loud and proud, right? Right.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} font-sans antialiased`}>
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
          {children}
        </ClerkProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
