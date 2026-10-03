import { UserButton } from '@clerk/react-router';
import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function Navbar({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();

  return (
    <nav
      className={cn(
        'flex h-14 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6',
        className,
      )}
    >
      <Link
        to="/"
        className="text-lg font-semibold tracking-tight hover:opacity-80"
      >
        Zerospin Shopping
      </Link>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Open cart"
          onClick={() => {
            toggleSidebar();
          }}
        >
          <ShoppingCart className="size-4" />
        </Button>
        <UserButton />
      </div>
    </nav>
  );
}
