import { Space_Mono, Silkscreen } from "next/font/google";
import { Show } from "@clerk/nextjs";

import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Wordmark } from "@/components/Wordmark";

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: "700",
});

const occupiedPixelCells = [
  // Q
  { row: 1, column: 2 },
  { row: 1, column: 3 },
  { row: 2, column: 1 },
  { row: 2, column: 4 },
  { row: 3, column: 1 },
  { row: 3, column: 4 },
  { row: 4, column: 1 },
  { row: 4, column: 4 },
  { row: 5, column: 2 },
  { row: 5, column: 3 },
  { row: 6, column: 4 },

  // R
  { row: 1, column: 7 },
  { row: 1, column: 8 },
  { row: 1, column: 9 },
  { row: 2, column: 7 },
  { row: 2, column: 10 },
  { row: 3, column: 7 },
  { row: 3, column: 8 },
  { row: 3, column: 9 },
  { row: 4, column: 7 },
  { row: 4, column: 9 },
  { row: 5, column: 7 },
  { row: 5, column: 10 },

  // K
  { row: 1, column: 13 },
  { row: 1, column: 16 },
  { row: 2, column: 13 },
  { row: 2, column: 15 },
  { row: 3, column: 13 },
  { row: 3, column: 14 },
  { row: 4, column: 13 },
  { row: 4, column: 15 },
  { row: 5, column: 13 },
  { row: 5, column: 16 },

  // Period
  { row: 5, column: 19 },

  // S
  { row: 1, column: 23 },
  { row: 1, column: 24 },
  { row: 1, column: 25 },
  { row: 2, column: 22 },
  { row: 3, column: 23 },
  { row: 3, column: 24 },
  { row: 4, column: 25 },
  { row: 5, column: 22 },
  { row: 5, column: 23 },
  { row: 5, column: 24 },

  // H
  { row: 1, column: 28 },
  { row: 1, column: 31 },
  { row: 2, column: 28 },
  { row: 2, column: 31 },
  { row: 3, column: 28 },
  { row: 3, column: 29 },
  { row: 3, column: 30 },
  { row: 3, column: 31 },
  { row: 4, column: 28 },
  { row: 4, column: 31 },
  { row: 5, column: 28 },
  { row: 5, column: 31 },
];

export default function HomePage() {
  return (
    <main className="relative h-svh overflow-x-auto overflow-y-hidden">
      <header className="sticky top-0 left-0 z-20 flex h-16 w-screen items-center justify-between bg-background px-6 md:px-8 lg:px-10">
        <Wordmark />

        <Show
          fallback={
            <UnderlinedLink href="/sign-in" size="lg">
              Login
            </UnderlinedLink>
          }
          when="signed-in"
        >
          <UnderlinedLink
            className={`${silkscreen.className} font-bold text-[#E86F3A] no-underline! hover:underline! underline-offset-auto!`}
            href="/replace"
            size="lg"
          >
            DASHBOARD
          </UnderlinedLink>
        </Show>
      </header>

      <div
        aria-label="QRK.SH pixel wordmark"
        className="relative z-0 grid h-[calc(100svh-9rem)] w-max"
        style={{
          gridTemplateColumns: "repeat(31, calc((100svh - 9rem) / 6))",
          gridTemplateRows: "repeat(6, calc((100svh - 9rem) / 6))",
        }}
      >
        <section
          aria-labelledby="home-hero-heading"
          className="pointer-events-none @container z-10 col-start-2 col-end-3 row-start-1 row-end-2"
        >
          <h1
            className={`${spaceMono.className} flex h-full flex-col justify-center p-4 text-left text-[20cqw] leading-none font-700 tracking-[-0.025em] text-white [word-spacing:-0.1em]`}
            id="home-hero-heading"
          >
            <span>be a</span>
            <span>little</span>
            <span>much</span>
          </h1>
        </section>

        {occupiedPixelCells.map((pixel, index) => (
          <a
            aria-label={`QRK.SH pixel ${index + 1}`}
            className="block bg-black hover:bg-[#E86F3A] focus-visible:bg-[#E86F3A] focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white"
            href="#"
            key={`${pixel.row}-${pixel.column}`}
            style={{
              gridColumnStart: pixel.column,
              gridRowStart: pixel.row,
            }}
          />
        ))}
      </div>

      <footer className="sticky bottom-0 left-0 z-20 flex h-20 w-screen items-center justify-between gap-4 bg-background px-6 text-xs md:px-8 lg:px-10">
        <p>Like legos... but websites</p>
        <nav aria-label="Legal pages" className="flex shrink-0 gap-4">
          <UnderlinedLink href="/privacy" size="sm">
            Privacy
          </UnderlinedLink>
          <UnderlinedLink href="/terms" size="sm">
            Terms
          </UnderlinedLink>
        </nav>
      </footer>
    </main>
  );
}
