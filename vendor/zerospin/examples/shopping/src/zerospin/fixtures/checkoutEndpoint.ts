import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';

import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { nodeHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Schema } from 'effect';

import appWorker from '../../appWorker';

const submitted: (typeof EncodedServiceCommandSchema.Type)[] = [];
let loseResponse = true;
class FixtureSystemApi extends RpcTarget {
  executeServiceCommand(request: unknown) {
    const decoded = Schema.decodeUnknownSync(
      Schema.Struct({
        args: Schema.Tuple([
          Schema.Struct({
            serviceVersion: Schema.String,
            command: EncodedServiceCommandSchema,
          }),
        ]),
      }),
    )(request);
    const command = decoded.args[0].command;
    submitted.push(command);
    if (loseResponse) {
      loseResponse = false;
      throw new Error('fixture response lost after authoritative command');
    }
    return {
      result: {
        _tag: 'Success',
        success: { execution: { status: 'succeeded' } },
      },
      link: null,
    };
  }
}
class FixtureGateway extends RpcTarget {
  getSystemApi({ zerospinSecretKey }: { zerospinSecretKey: string }) {
    assert.equal(zerospinSecretKey, 'sk_checkout_fixture');
    return new FixtureSystemApi();
  }
}
const server = createServer((request, response) => {
  void nodeHttpBatchRpcResponse(request, response, new FixtureGateway());
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const origin = 'https://shopping.fixture';
const jwt = (subject: string, azp = origin) => {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: subject,
      azp,
      iss: 'https://clerk.fixture',
      iat: now,
      nbf: now - 1,
      exp: now + 60,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
};
const env: Cloudflare.Env = {
  CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  CLERK_AUTHORIZED_PARTIES: origin,
  ZEROSPIN_API_URL: `http://127.0.0.1:${address.port}`,
  ZEROSPIN_SECRET_KEY: 'sk_checkout_fixture',
  ZEROSPIN_ENVIRONMENT: 'dev',
  ASSETS: { fetch: async () => new Response('asset') },
};
const request = (
  body: unknown,
  token = jwt('user_alice'),
  requestOrigin = origin,
) =>
  new Request(`${origin}/api/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
try {
  assert.equal(
    (await appWorker.fetch(new Request(`${origin}/`), env)).status,
    200,
  );
  assert.equal(
    (await appWorker.fetch(new Request(`${origin}/api/checkout`), env)).status,
    405,
  );
  const payload = { cartId: 'crt_alice', nonce: 'checkout-fixture-nonce' };
  assert.equal(
    (
      await appWorker.fetch(
        request(payload, jwt('user_alice'), 'https://other.fixture'),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await appWorker.fetch(request(payload, 'invalid-token'), env)).status,
    401,
  );
  assert.equal(
    (
      await appWorker.fetch(
        request(payload, jwt('user_alice', 'https://other.fixture')),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await appWorker.fetch(
        request({ ...payload, quote: { total: 1 }, clerkUserId: 'user_bob' }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(submitted.length, 0);
  assert.equal((await appWorker.fetch(request(payload), env)).status, 503);
  assert.equal((await appWorker.fetch(request(payload), env)).status, 200);
  assert.equal(submitted.length, 2);
  assert.deepEqual(
    submitted[0],
    submitted[1],
    'uncertain response retries preserve the complete command occurrence',
  );
  assert.deepEqual(submitted[0]?.caller?.claims, { clerkUserId: 'user_alice' });
  assert.equal(submitted[0]?.caller?.actorName, 'shopper');
  assert.equal(submitted[0]?.caller?.nodeId, null);
  assert.equal(submitted[0]?.caller?.sessionName, null);
  assert.equal(
    (await appWorker.fetch(request(payload, jwt('user_bob')), env)).status,
    200,
  );
  assert.notEqual(submitted[0]?.id, submitted[2]?.id);
  assert.deepEqual(submitted[2]?.caller?.claims, { clerkUserId: 'user_bob' });
  assert.notEqual(
    JSON.parse(submitted[0]!.payload).purchaseId,
    JSON.parse(submitted[2]!.payload).purchaseId,
  );
  console.log(
    'Shopping checkout endpoint verifies signed Clerk claims, origin, bounded input and unchanged complete commands after response loss',
  );
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}
