import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { newWebSocketRpcSession, type RpcStub } from 'capnweb';
import { env, exports as workerExports } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

const RPC_LOOPBACK_ORIGIN = 'http://zerospin-test-rpc.invalid';

/** Activate the test generation, then open the real DevWorker Gateway ingress. */
export async function makeTestGateway(): Promise<
  Readonly<{ gatewayApi: RpcStub<GatewayApi>; generationId: string }>
> {
  const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
  let snapshot = await Effect.runPromise(
    decodeRpc(await systemRepo.startDeploy({ clean: false })),
  );

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const validated = Schema.decodeUnknownSync(
      Schema.Struct({
        activationCheckpoint: Schema.Literal(
          'allocated',
          'generation-prepared',
          'continuous-replay',
          'pre-cut-ready',
          'ownership-cut',
          'source-writes-terminal',
          'fixed-point-drained',
          'final-replay-complete',
        ),
        clean: Schema.Boolean,
        deployId: Schema.String,
        failure: Schema.NullOr(ZerospinError.schema),
        generationId: Schema.String,
        status: Schema.Literal('activating', 'succeeded', 'failed'),
        workerVersionId: Schema.String,
      }),
    )(snapshot);

    if (validated.status === 'succeeded') {
      const rpcResponse = await workerExports.default.fetch(
        new Request(RPC_LOOPBACK_ORIGIN, {
          headers: { Upgrade: 'websocket' },
        }),
      );
      if (
        rpcResponse.status !== 101 ||
        !('webSocket' in rpcResponse) ||
        !(rpcResponse.webSocket instanceof WebSocket) ||
        !('accept' in rpcResponse.webSocket) ||
        typeof rpcResponse.webSocket.accept !== 'function'
      ) {
        throw new Error(
          `DevWorker Gateway handshake failed with HTTP ${rpcResponse.status}`,
        );
      }
      rpcResponse.webSocket.accept();
      return {
        gatewayApi: newWebSocketRpcSession<GatewayApi>(rpcResponse.webSocket),
        generationId: validated.generationId,
      };
    }
    if (validated.status === 'failed') {
      throw new Error(
        `SystemRepo deployment failed: ${JSON.stringify(validated.failure)}`,
      );
    }

    snapshot = await Effect.runPromise(
      decodeRpc(await systemRepo.getDeploy({ deployId: validated.deployId })),
    );
  }

  throw new Error('SystemRepo deployment did not complete after 100 polls');
}
