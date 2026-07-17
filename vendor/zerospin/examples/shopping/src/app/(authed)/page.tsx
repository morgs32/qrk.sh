'use client';

import type { CSSProperties } from 'react';

import { Navbar } from './Navbar';
import { ProductList } from './ProductList';
import { ShoppingCartSidebar } from './ShoppingCartSidebar';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function Page() {
  return (
    <SidebarProvider
      defaultOpen
      style={
        {
          '--sidebar-width': '22rem',
        } as CSSProperties
      }
    >
      <SidebarInset>
        <Navbar />
        <div className="flex flex-1 flex-col gap-8 bg-muted/30 p-6">
          <ProductList />
        </div>
      </SidebarInset>
      <ShoppingCartSidebar />
    </SidebarProvider>
  );
}
