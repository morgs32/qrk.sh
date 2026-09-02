import { newWorkersRpcResponse, RpcTarget } from 'capnweb';

export class CounterApi extends RpcTarget {
  private readonly state: { counterId: string; count: number };

  constructor(counterId: string) {
    super();
    this.state = { counterId, count: 0 };
  }

  increment(): number {
    this.state.count += 1;
    return this.state.count;
  }
}

export class GatewayApi extends RpcTarget {
  getCounterApi(counterId: string): CounterApi {
    return new CounterApi(counterId);
  }
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default {
  fetch(request: Request) {
    if (new URL(request.url).pathname === '/api/counter') {
      return newWorkersRpcResponse(request, new GatewayApi());
    }

    return new Response('Not found', { status: 404 });
  },
};
