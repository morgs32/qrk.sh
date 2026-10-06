import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';

import { newSyncRpcSession } from '@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession';
import { nodeHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Schema } from 'effect';

import { StudioAgentApi } from '../dist/StudioAgentApi/StudioAgentApi.js';
import { fetchAgentAggregateIds } from '../dist/useAgentAggregateIds.js';

const secret = 'sk_studio_rpc_fixture';
const identity = {
  aggregateName: 'fixture/name #1',
  aggregateVersion: '1.0.0',
};
const ids = ['acct_a', 'acct_shared', 'acct_z'];
const upstreamCalls = [];
let mode = 'success';
const failure = (code, message) => ({
  _tag: 'Failure',
  failure: { _tag: 'ZerospinError', code, message, status: null, extra: null },
});

class FixtureSystemApi extends RpcTarget {
  getAgentAggregateIds(request) {
    const { args } = Schema.decodeUnknownSync(
      Schema.Struct({
        args: Schema.Tuple([
          Schema.Struct({
            aggregateName: Schema.String,
            aggregateVersion: Schema.String,
          }),
        ]),
        traceContext: Schema.Unknown,
      }),
    )(request);
    upstreamCalls.push(args[0]);
    if (mode === 'invalid-envelope') return { unexpected: true };
    const result =
      mode === 'domain-failure'
        ? failure(
            'agent-aggregate-unavailable',
            'Aggregate version unavailable.',
          )
        : {
            _tag: 'Success',
            success: mode === 'invalid-ids' ? ['not-an-aggregate-id'] : ids,
          };
    return { result, link: null };
  }
}

class FixtureRejectedSystemApi extends RpcTarget {
  getAgentAggregateIds() {
    return {
      result: failure('system-api-secret-invalid', 'Fixture secret rejected.'),
      link: null,
    };
  }
}

class FixtureGatewayApi extends RpcTarget {
  getSystemApi(props) {
    assert.equal(props.zerospinSecretKey, secret);
    return mode === 'admission-failure'
      ? new FixtureRejectedSystemApi()
      : new FixtureSystemApi();
  }
}

class FixtureMalformedStudioApi extends RpcTarget {
  getAgentAggregateIds() {
    return { unexpected: true };
  }
}

const upstream = createServer((request, response) => {
  void nodeHttpBatchRpcResponse(request, response, new FixtureGatewayApi());
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const upstreamAddress = upstream.address();
assert.ok(upstreamAddress && typeof upstreamAddress === 'object');
const upstreamUrl = `http://127.0.0.1:${upstreamAddress.port}`;
const studioApi = new StudioAgentApi({
  zerospinApiUrl: upstreamUrl,
  zerospinSecretKey: secret,
});
const studio = createServer((request, response) => {
  void nodeHttpBatchRpcResponse(
    request,
    response,
    mode === 'malformed-local-outcome'
      ? new FixtureMalformedStudioApi()
      : studioApi,
  );
});
await new Promise(resolve => studio.listen(0, '127.0.0.1', resolve));
const studioAddress = studio.address();
assert.ok(studioAddress && typeof studioAddress === 'object');
const studioUrl = `http://127.0.0.1:${studioAddress.port}/api/agents/rpc`;
const nativeFetch = globalThis.fetch;
const browserRequests = [];
const browserResponses = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.url !== studioUrl) return nativeFetch(request);
  browserRequests.push(await request.clone().text());
  const response = await nativeFetch(request);
  browserResponses.push(await response.clone().text());
  return response;
};

try {
  assert.deepEqual(await fetchAgentAggregateIds(identity, studioUrl), ids);
  assert.deepEqual(upstreamCalls, [identity]);
  assert.deepEqual(await fetchAgentAggregateIds(identity, studioUrl), ids);
  assert.equal(browserRequests.length, 2, 'each fetch owns a new RPC batch');

  mode = 'domain-failure';
  await assert.rejects(fetchAgentAggregateIds(identity, studioUrl), error => {
    assert.equal(error.message, 'Aggregate version unavailable.');
    assert.equal(error.cause.code, 'agent-aggregate-unavailable');
    return true;
  });
  mode = 'admission-failure';
  await assert.rejects(fetchAgentAggregateIds(identity, studioUrl), error => {
    assert.equal(error.message, 'Fixture secret rejected.');
    assert.equal(error.cause.code, 'system-api-secret-invalid');
    return true;
  });
  mode = 'invalid-envelope';
  await assert.rejects(fetchAgentAggregateIds(identity, studioUrl), error => {
    assert.equal(error.cause.code, 'rpc-invalid-response');
    return true;
  });
  mode = 'invalid-ids';
  await assert.rejects(fetchAgentAggregateIds(identity, studioUrl));
  mode = 'malformed-local-outcome';
  await assert.rejects(fetchAgentAggregateIds(identity, studioUrl));
  mode = 'success';
  assert.deepEqual(await fetchAgentAggregateIds(identity, studioUrl), ids);

  {
    using api = newSyncRpcSession(studioUrl);
    const privateValues = await Promise.all([
      api.zerospinSecretKey,
      api.zerospinApiUrl,
    ]);
    assert.deepEqual(privateValues, [undefined, undefined]);
  }
  {
    using api = newSyncRpcSession(studioUrl);
    await assert.rejects(Promise.resolve(api.getSystemApi()));
  }
  assert.equal(Object.hasOwn(studioApi, 'zerospinSecretKey'), false);
  assert.equal(Object.hasOwn(studioApi, 'zerospinApiUrl'), false);
  for (const body of [...browserRequests, ...browserResponses]) {
    assert.equal(
      body.includes(secret),
      false,
      'secret stays on the Studio server',
    );
  }
  console.log(
    'PASS: production Studio adapter and disposable fetcher forward sorted IDs through real HTTP batch RPC',
  );
  console.log(
    'PASS: structured domain/admission failures and invalid upstream/local outcomes become query errors; retry succeeds',
  );
  console.log(
    'PASS: browser RPC exposes only aggregate-ID reads and never carries administrative credentials',
  );
} finally {
  globalThis.fetch = nativeFetch;
  const studioClosed = once(studio, 'close');
  const upstreamClosed = once(upstream, 'close');
  studio.close();
  upstream.close();
  await Promise.all([studioClosed, upstreamClosed]);
}
