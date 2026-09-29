import * as sdk from '@zerospin/sdk';

import { addToCartV2 } from '../contracts/addToCart/AddToCartV2';
import { removeFromCartV2 } from '../contracts/removeFromCart/removeFromCartV2';
import { updateCartItemQuantityV1 } from '../contracts/updateCartItemQuantity/UpdateCartItemQuantityV1';
import { fulfillment } from '../fulfillment';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV2 } from '../models/cartItem/CartItemV2';
import { productReplicaV1 } from '../models/productReplica/ProductReplicaV1';
import { userV1 } from '../models/user/UserV1';
import { purchase } from '../purchase';
import { purchaseFrontend } from '../purchaseFrontend';

import { shopperActorV1 } from './shopperActorV1';
const {
  checkout: checkoutV1,
  purchaseItem: purchaseItemV1,
  purchase: purchaseV1,
  paymentIntent: paymentIntentV1,
  cartPromotion: cartPromotionV1,
} = purchaseFrontend.models;

const db = sdk.makeActorDbVersion({
  models: {
    fulfillment: fulfillment.models.fulfillment,
    fulfillmentOperation: fulfillment.models.fulfillmentOperation,
    checkout: checkoutV1,
    paymentIntent: paymentIntentV1,
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
    cartPromotion: cartPromotionV1,
  },
});
export const shopperActorV2 = sdk.updateAggregateActorVersion(shopperActorV1, {
  db,
  version: '2.0.0',
  contracts: {
    requestPacking: fulfillment.contracts.requestPacking,
    requestShipping: fulfillment.contracts.requestShipping,
    applyPromotion: purchase.contracts.applyPromotion,
    removePromotion: purchase.contracts.removePromotion,
    confirmCheckout: purchase.contracts.confirmCheckout,
    initiatePayment: purchase.contracts.initiatePayment,
    cancelPurchase: purchase.contracts.cancelPurchase,
    addToCart: addToCartV2,
    removeFromCart: removeFromCartV2,
    updateCartItemQuantity: updateCartItemQuantityV1,
  },
  queries: {
    fulfillment: db.query.fulfillment.findMany({
      where: {
        RAW: (row, { sql }) =>
          sql`${row.userId} in (${db.query.user.findMany({ where: { clerkUserId: { eq: shopperActorV1.identity.sql.placeholder('clerkUserId') } }, columns: { id: true } })})`,
      },
    }),
    fulfillmentOperation: db.query.fulfillmentOperation.findMany({
      where: {
        fulfillment: {
          RAW: (row, { sql }) =>
            sql`${row.userId} in (${db.query.user.findMany({ where: { clerkUserId: { eq: shopperActorV1.identity.sql.placeholder('clerkUserId') } }, columns: { id: true } })})`,
        },
      },
    }),
    checkout: db.query.checkout.findMany({
      where: {
        user: {
          clerkUserId: {
            eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
          },
        },
      },
    }),
    paymentIntent: db.query.paymentIntent.findMany({
      where: {
        purchase: {
          cart: {
            user: {
              clerkUserId: {
                eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
              },
            },
          },
        },
      },
    }),
    user: db.query.user.findMany({
      where: {
        clerkUserId: {
          eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
        },
      },
    }),
    cart: db.query.cart.findMany({
      where: {
        user: {
          clerkUserId: {
            eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
          },
        },
      },
    }),
    cartItem: db.query.cartItem.findMany({
      where: {
        cart: {
          user: {
            clerkUserId: {
              eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
            },
          },
        },
      },
    }),
    product: db.query.product.findMany({
      where: {
        OR: [
          {
            cartItems: {
              cart: {
                user: {
                  clerkUserId: {
                    eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
                  },
                },
              },
            },
          },
          {
            purchaseItems: {
              purchase: {
                cart: {
                  user: {
                    clerkUserId: {
                      eq: shopperActorV1.identity.sql.placeholder(
                        'clerkUserId',
                      ),
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }),
    purchase: db.query.purchase.findMany({
      where: {
        cart: {
          user: {
            clerkUserId: {
              eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
            },
          },
        },
      },
    }),
    purchaseItem: db.query.purchaseItem.findMany({
      where: {
        purchase: {
          cart: {
            user: {
              clerkUserId: {
                eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
              },
            },
          },
        },
      },
    }),
    cartPromotion: db.query.cartPromotion.findMany({
      where: {
        cart: {
          user: {
            clerkUserId: {
              eq: shopperActorV1.identity.sql.placeholder('clerkUserId'),
            },
          },
        },
      },
    }),
  },
});
