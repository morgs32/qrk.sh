import { Navbar } from '@/components/Navbar';
import { ProductList } from '@/components/ProductList';
import { ShoppingCartSidebar } from '@/components/ShoppingCartSidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export function ShoppingRoute() {
  return (
    <SidebarProvider defaultOpen className="[--sidebar-width:22rem]">
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
