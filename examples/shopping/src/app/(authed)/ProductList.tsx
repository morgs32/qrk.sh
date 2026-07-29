'use client';

import { useInitializedStateOrThrow } from '@zerospin/react/useInitializedStateOrThrow';
import { useLiveQuery } from '@zerospin/react/useLiveQuery';

import { ProductCard } from './ProductCard';
import { ZerospinCatalog } from './ZerospinCatalog';
import { ZerospinShopper } from './ZerospinShopper';

export function ProductList() {
  const { actorId } = useInitializedStateOrThrow(ZerospinShopper);
  const { data: products } = useLiveQuery(ZerospinCatalog, {
    query: db => db.query.product.findMany(),
  });

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
