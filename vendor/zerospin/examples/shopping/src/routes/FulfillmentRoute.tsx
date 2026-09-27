import { useState } from 'react';

import { stageCommand, useLiveQuery } from '@zerospin/react';
import { Link } from 'react-router';

import { Navbar } from '@/components/Navbar';
import { ShoppingCartSidebar } from '@/components/ShoppingCartSidebar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { fulfillmentFrontend } from '@/zerospin/aggregates/shopper/fulfillmentFrontend';
import { shopperSession } from '@/zerospin/shopperSession';
export function FulfillmentRoute() {
  const { data: purchases } = useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.purchase.findMany({
        where: { status: { eq: 'paid' } },
        with: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
  });
  const { data: fulfillments } = useLiveQuery({
    session: shopperSession,
    query: db => db.query.fulfillment.findMany({ with: { operations: true } }),
  });
  const [error, setError] = useState<string | null>(null);
  const request = (fulfillmentId: `ful_${string}`, action: 'pack' | 'ship') => {
    const result = stageCommand({
      session: shopperSession,
      contractName: action === 'pack' ? 'requestPacking' : 'requestShipping',
      payload: {
        id: shopperSession.makeId(
          fulfillmentFrontend.models.fulfillmentOperation,
        ),
        fulfillmentId,
      },
    });
    setError(result._tag === 'Failure' ? result.failure.message : null);
  };
  return (
    <SidebarProvider defaultOpen={false} className="[--sidebar-width:22rem]">
      <SidebarInset>
        <Navbar />
        <main className="flex flex-1 flex-col gap-6 bg-muted/30 p-6 md:p-10">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Demo operations
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Fulfillment
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pack and ship paid purchases manually. Fulfillment progress is
              saved and updates across sessions.
            </p>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          {purchases?.length === 0 ? (
            <div className="rounded-xl border bg-background p-8">
              <h2 className="font-semibold">No paid purchases yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Complete checkout to see your order here. The demo payment takes
                five seconds.
              </p>
              <Link to="/" className="mt-4 inline-block text-sm underline">
                Back to shopping
              </Link>
            </div>
          ) : null}
          {purchases?.map(purchase => {
            const fulfillment = fulfillments?.find(
              row => row.purchaseId === purchase.id,
            );
            const stage = fulfillment?.status ?? 'enrolling';
            const pending = fulfillment?.operations.find(
              row => row.status === 'requested',
            );
            const latest = fulfillment?.operations.toSorted(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            )[0];
            return (
              <article
                key={purchase.id}
                className="rounded-xl border bg-background p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">
                      Order {purchase.id.slice(-8)}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: purchase.currency,
                      }).format(purchase.totalAmount / 100)}{' '}
                      · Payment received
                    </p>
                  </div>
                  <span
                    role="status"
                    className="rounded-full bg-muted px-3 py-1 text-sm"
                  >
                    {stage === 'enrolling'
                      ? 'Preparing fulfillment'
                      : stage === 'requested'
                        ? 'Ready to pack'
                        : stage === 'packed'
                          ? 'Packed'
                          : 'Shipped'}
                  </span>
                </div>
                <ul className="my-5 space-y-2 border-y py-4 text-sm">
                  {purchase.items.map(item => (
                    <li key={item.id}>
                      {item.quantity} × {item.name}
                    </li>
                  ))}
                </ul>
                {pending ? (
                  <p role="status">
                    {pending.action === 'pack' ? 'Packing' : 'Shipping'}{' '}
                    requested…
                  </p>
                ) : null}
                {latest?.status === 'failed' ? (
                  <p role="alert">{latest.failure} Retry the action below.</p>
                ) : null}
                {stage === 'shipped' ? (
                  <p className="text-sm text-muted-foreground">
                    Simulated tracking: {fulfillment?.trackingId}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    disabled={
                      !fulfillment || stage !== 'requested' || !!pending
                    }
                    onClick={() =>
                      fulfillment && request(fulfillment.id, 'pack')
                    }
                  >
                    Pack
                  </Button>
                  <Button
                    disabled={!fulfillment || stage !== 'packed' || !!pending}
                    onClick={() =>
                      fulfillment && request(fulfillment.id, 'ship')
                    }
                  >
                    Ship
                  </Button>
                </div>
              </article>
            );
          })}
        </main>
      </SidebarInset>
      <ShoppingCartSidebar />
    </SidebarProvider>
  );
}
