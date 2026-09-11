import { useInitializedStateOrThrow, useLiveQuery } from '@zerospin/react';

import { ProductCard } from './ProductCard';

import { ZerospinApp } from '@/zerospin/ZerospinApp';

export function ProductList() {
  const { authentication } = useInitializedStateOrThrow(
    ZerospinApp.frontends.shopperFrontend,
  );
  const { data: products } = useLiveQuery(ZerospinApp.frontends.appFrontend, {
    query: db => db.query.product.findMany(),
  });

  const { data: user } = useLiveQuery(ZerospinApp.frontends.shopperFrontend, {
    query: db =>
      db.query.user.findFirst({
        where: { clerkUserId: { eq: authentication.clerkUserId } },
      }),
    deps: [authentication.clerkUserId],
  });

  if (user === undefined) {
    return null;
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
