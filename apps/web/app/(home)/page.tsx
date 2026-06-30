"use client";

import { HeroCopy } from "@/components/home/HeroCopy";
import { HomeGrid } from "./HomeGrid";

export default function HomePage() {
  return (
    <div className="h-screen pt-16">
      <HeroCopy />

      <div
        data-home-right-scroll
        className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-1/2 min-w-0 overflow-y-auto"
      >
        <div className="w-full pb-24">
          <HomeGrid />
        </div>
      </div>
    </div>
  );
}
