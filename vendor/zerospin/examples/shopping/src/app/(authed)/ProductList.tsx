'use client';

import { useApi } from '@zerospin/react/useApi';
import { useInitializedStateOrThrow } from '@zerospin/react/useInitializedStateOrThrow';
import { useLiveQuery } from '@zerospin/react/useLiveQuery';
import { useSession } from '@zerospin/react/useSession';
import { Either } from 'effect';
import useSWR from 'swr';

import { ProductCard } from './ProductCard';
import { ZerospinShopper } from './ZerospinShopper';

import type { shopperActor } from '@/zerospin/system';

export function ProductList() {
  const { actorId } = useInitializedStateOrThrow(ZerospinShopper);
  const session = useSession(ZerospinShopper);
  const api = useApi<typeof shopperActor>(ZerospinShopper);
  const { data: products } = useSWR(
    ['products', session.sessionId],
    async () => {
      return api
        .executeActorQuery({
          queryName: 'getProducts',
          params: {},
        })
        .then(Either.getOrThrowWith(error => error));
    },
  );

  const { data: user } = useLiveQuery(ZerospinShopper, {
    query: db =>
      db.query.user.findFirst({
        where: { actorId: { eq: actorId } },
      }),
    deps: [actorId],
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!products) {
    return null;
  }

  return (
    <section className="@container w-full space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">
          Products
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse the catalog and add items to your cart.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @xl:grid-cols-3 @5xl:grid-cols-4">
        {products.map(product => (
          <ProductCard key={product.id} product={product} userId={user.id} />
        ))}
      </div>
    </section>
  );
}
