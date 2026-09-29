import {
  purchaseFrontend,
  purchaseIdentity,
  type purchaseHost,
} from './browserConsumer.typecheck.js';
import { makePurchaseModule } from './server.js';
export const purchase: ReturnType<
  typeof makePurchaseModule<
    typeof purchaseHost,
    typeof purchaseIdentity,
    typeof purchaseIdentity
  >
> = makePurchaseModule<
  typeof purchaseHost,
  typeof purchaseIdentity,
  typeof purchaseIdentity
>({
  frontend: purchaseFrontend,
  selectionIdentitySchema: purchaseIdentity,
  resolveUserId: ({ db, claims }) =>
    db.query.user
      .findMany()
      .sync()
      .find(user => user.id === claims.userId)?.id,
});
