import { useEffect, useRef, useState } from 'react';

import { prefixId } from '@zerospin/core/models/prefixId';
import { ZerospinError } from '@zerospin/error';
import {
  useInitializedStateOrThrow,
  useLiveQuery,
  useSession,
} from '@zerospin/react';

import { ProductCard } from './ProductCard';

import { userV1 } from '@/zerospin/aggregates/shopper/models/user/UserV1';
import { ZerospinApp } from '@/zerospin/ZerospinApp';

export function ProductList() {
  const { userId } = useInitializedStateOrThrow(
    ZerospinApp.frontends.shopperFrontend,
  );
  const session = useSession(ZerospinApp.frontends.shopperFrontend);
  const userCreationStarted = useRef(false);
  const [userCreationFailure, setUserCreationFailure] =
    useState<ZerospinError<string> | null>(null);
  const { data: products } = useLiveQuery(ZerospinApp.frontends.appFrontend, {
    query: db => db.query.product.findMany(),
  });

  const { data: user } = useLiveQuery(ZerospinApp.frontends.shopperFrontend, {
    query: db =>
      db.query.user.findFirst({
        where: { clerkUserId: { eq: userId } },
      }),
    deps: [userId],
  });

  useEffect(() => {
    if (user !== undefined || userCreationStarted.current) return;
    userCreationStarted.current = true;
    const result = session.executeCommand({
      contractName: 'createUser',
      payload: {
        id: prefixId(userV1, userId),
        clerkUserId: userId,
      },
    });
    if (result._tag === 'Failure') {
      setUserCreationFailure(new ZerospinError(result.failure));
    }
  }, [session, user, userId]);

  if (userCreationFailure !== null) {
    throw userCreationFailure;
  }

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
