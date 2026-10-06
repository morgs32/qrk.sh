import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { checkoutIdentity } from './checkoutIdentity';
import type { IClerkUserId } from './zerospin/claims';
import { checkoutV1 } from './zerospin/services/marketplace/contracts/checkout/checkoutV1';
import { verifyClerkIdentityWithEnv } from './zerospin/verifyClerkIdentity';

const CheckoutRequest = Schema.Struct({
  cartId: makeAbbreviationIdSchema('crt'),
  nonce: Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(128)),
});

// oxlint-disable-next-line import/no-default-export -- Wrangler requires a default worker handler.
export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/checkout') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') {
      return Response.json(
        { message: 'Use POST for checkout.' },
        { status: 405 },
      );
    }
    if (request.headers.get('origin') !== url.origin) {
      return Response.json(
        { message: 'Checkout must originate from this app.' },
        { status: 403 },
      );
    }
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer (.+)$/)?.[1];
    if (!token) {
      return Response.json(
        { message: 'Sign in before checking out.' },
        { status: 401 },
      );
    }
    let payload: typeof CheckoutRequest.Type;
    try {
      payload = Schema.decodeUnknownSync(CheckoutRequest)(
        await request.json(),
        { onExcessProperty: 'error' },
      );
    } catch {
      return Response.json(
        { message: 'Checkout accepts only a cart ID and stable nonce.' },
        { status: 400 },
      );
    }
    let subject: IClerkUserId;
    try {
      subject = await Effect.runPromise(
        verifyClerkIdentityWithEnv({ token }, env),
      );
    } catch {
      return Response.json(
        { message: 'The Clerk session could not be verified.' },
        { status: 401 },
      );
    }
    try {
      if (!env.ZEROSPIN_API_URL || !env.ZEROSPIN_SECRET_KEY) {
        return Response.json(
          { message: 'Checkout is not configured on the app server.' },
          { status: 503 },
        );
      }
      const { commandId, purchaseId } = await checkoutIdentity(
        subject,
        payload.nonce,
      );
      const api = await Effect.runPromise(
        getApi<GatewayApi>(env.ZEROSPIN_API_URL)(gateway =>
          gateway.getSystemApi({ zerospinSecretKey: env.ZEROSPIN_SECRET_KEY! }),
        ),
      );
      const terminal = await Effect.runPromise(
        api.executeServiceCommand({
          serviceVersion: '1.0.0',
          command: {
            id: commandId,
            commandName: 'checkout',
            contractVersion: '1.0.0',
            serviceName: 'marketplace',
            serviceVersion: '1.0.0',
            payload: await Effect.runPromise(
              encodePayload(checkoutV1, {
                version: checkoutV1.version,
                payload: { cartId: payload.cartId, purchaseId },
              }),
            ),
            caller: {
              actorName: 'shopper',
              actorVersion: '1.0.0',
              claims: { clerkUserId: subject },
              nodeId: null,
              nodeIndex: null,
              sessionName: null,
            },
          },
        }),
      );
      if (terminal.execution.status !== 'succeeded') {
        return Response.json(
          { message: 'The cart could not be checked out.', purchaseId },
          { status: 409 },
        );
      }
      return Response.json(
        { purchaseId, paymentState: 'pending' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      // An unknown response can follow durable admission. The client retains its nonce.
      return Response.json(
        {
          message:
            'Checkout could not be confirmed. Retry with the same checkout request.',
        },
        { status: 503 },
      );
    }
  },
};
