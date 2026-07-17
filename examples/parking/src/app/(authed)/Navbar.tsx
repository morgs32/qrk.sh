'use client';

import { UserButton } from '@clerk/nextjs';
import { ParkingCircle } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

export function Navbar({ className }: { className?: string }) {
  return (
    <nav
      className={cn(
        'flex h-14 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6',
        className,
      )}
    >
      <Link
        href="/"
        className="flex items-center gap-2 text-lg font-semibold tracking-tight hover:opacity-80"
      >
        <ParkingCircle className="size-5" />
        Zerospin Parking
      </Link>
      <div className="flex items-center gap-2">
        <UserButton />
      </div>
    </nav>
  );
}
