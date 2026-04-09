'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PortfolioGrid } from '@/components/home/portfolio-grid';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

type WorkItem = {
  name: string;
  category: string;
};

type HomeShellProps = {
  workItems: WorkItem[];
};

export function HomeShell({ workItems }: HomeShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen pt-16">
        <div className="fixed left-0 top-16 flex h-[calc(100vh-4rem)] w-1/2 flex-col justify-center bg-background px-6">
          <h1 className="text-[clamp(4rem,15vw,10rem)] font-bold leading-none tracking-tight">
            Hello
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
            We are a Sydney-based design studio specialising in branding and
            wayfinding.
          </p>
        </div>

        <div className="ml-auto h-[calc(100vh-4rem)] w-1/2 min-w-0 overflow-y-auto">
          <PortfolioGrid />

          <div className="bg-[#F0EDE8] px-6 py-16">
            <h2 className="mb-12 text-6xl font-bold">Work</h2>
            <div className="space-y-4">
              {workItems.map((item, index) => (
                <Link
                  key={index}
                  href="#"
                  className="block transition-opacity hover:opacity-70"
                >
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.category}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30">
        <div className="flex justify-end px-6 md:ml-[50%]">
          <Button
            type="button"
            size="icon"
            onClick={() => setIsDrawerOpen(true)}
            className="pointer-events-auto size-12 rounded-full shadow-lg"
            aria-label="Open drawer"
          >
            <Plus className="size-5" />
          </Button>
        </div>
      </div>

      <Drawer
        direction="left"
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      >
        <DrawerContent
          aria-label="Workspace drawer"
          overlayClassName="top-16 bottom-0 bg-transparent z-40"
          className="top-16 bottom-0 left-0 z-40 h-[calc(100vh-4rem)] w-full border-r border-border bg-background/95 p-6 shadow-2xl backdrop-blur-sm md:w-1/2"
        >
          <div className="h-full w-full" />
        </DrawerContent>
      </Drawer>
    </>
  );
}
