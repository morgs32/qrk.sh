import { useClaims, useLiveQuery } from '@zerospin/react';

import { CartItemQuantityControls } from './CartItemQuantityControls';
import { PurchasePanel } from './PurchasePanel';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { shopperSession } from '@/zerospin/shopperSession';

export function ShoppingCartSidebar() {
  const claims = useClaims(shopperSession);

  const { data: userRow } = useLiveQuery({
    session: shopperSession,
    key: { clerkUserId: claims.clerkUserId ?? undefined },
    query: (db, { clerkUserId }) =>
      db.query.user.findFirst({
        where: { clerkUserId: { eq: clerkUserId } },
        with: {
          cart: {
            with: {
              items: {
                with: {
                  product: true,
                },
              },
            },
          },
        },
      }),
  });

  const cartItems = userRow?.cart?.items ?? [];

  return (
    <Sidebar side="right" collapsible="offcanvas">
      <SidebarHeader className="gap-2 border-b border-sidebar-border p-4">
        <span className="text-lg font-semibold">Cart</span>
        <span className="text-muted-foreground text-xs leading-snug">
          Review items before checkout (demo).
        </span>
      </SidebarHeader>
      <SidebarContent className="min-w-0 overflow-y-auto">
        <div className="flex min-w-0 flex-col gap-2 p-3">
          {cartItems.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm leading-relaxed">
              Your cart is empty for {claims.clerkUserId}. Add products from the
              catalog.
            </p>
          ) : (
            <div className="space-y-2">
              {cartItems.map(cartItem => (
                <div
                  key={cartItem.id}
                  className="bg-background flex min-w-0 flex-col gap-2 rounded-md border border-sidebar-border/40 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {cartItem.product.name}
                    </p>
                  </div>
                  <CartItemQuantityControls
                    amount={cartItem.amount}
                    cartItemId={cartItem.id}
                  />
                </div>
              ))}
            </div>
          )}
          <PurchasePanel />
        </div>
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-sidebar-border p-4">
        {cartItems.length > 0 ? (
          <p className="text-right text-base font-semibold tabular-nums">
            Subtotal:{' '}
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(
              cartItems.reduce(
                (acc, cartItem) =>
                  acc + cartItem.product.price * cartItem.amount,
                0,
              ),
            )}
          </p>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
