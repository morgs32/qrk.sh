import Link from "next/link";
import { Inter, Silkscreen } from "next/font/google";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter({
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
        <Link aria-label="QRK.SH home" className={`${silkscreen.className} text-lg`} href="/">
          QRK.SH
        </Link>

        <Show
          fallback={
            <Button asChild variant="outline">
              <Link href="/sign-in">LOGIN</Link>
            </Button>
          }
          when="signed-in"
        >
          <Link
            className={`${silkscreen.className} font-bold text-[#E86F3A] hover:underline`}
            href="/post-auth"
          >
            DASHBOARD
          </Link>
        </Show>
      </header>

      <section
        aria-labelledby="home-hero-heading"
        className="pointer-events-none fixed inset-x-0 top-16 bottom-0 z-10 flex items-center px-6 md:px-8 lg:px-10"
      >
        <h1
          className={`${inter.className} text-[clamp(4rem,18vw,8rem)] leading-[0.85] font-bold tracking-[-0.08em] text-[#E86F3A] uppercase md:text-[clamp(3.25rem,7vw,6rem)] lg:text-[clamp(3rem,5vw,5rem)]`}
          id="home-hero-heading"
        >
          <span className="block">Make</span>
          <span className="block">your</span>
          <span className="block">mark.</span>
        </h1>
      </section>

      <div
        aria-label="QRK.SH pixel wordmark"
        className="relative z-0 grid h-[calc(100svh-4rem)] w-max"
        style={{
          gridTemplateColumns: "repeat(31, calc((100svh - 4rem) / 6))",
          gridTemplateRows: "repeat(6, calc((100svh - 4rem) / 6))",
        }}
      >
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
    </main>
  );
}
