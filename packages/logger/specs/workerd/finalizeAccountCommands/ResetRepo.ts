import { DurableObject } from 'cloudflare:workers';

// The spec writes its request to one instance, which consumes that durable
// request without aborting. A second instance performs the actual reset so the
// consumed request is not rolled back by `ctx.abort`.
export class ResetRepo extends DurableObject {
  async consumeResetRequest(): Promise<boolean> {
    const failNextSystemWorkerRpc = await this.ctx.storage.get<boolean>(
      'failNextSystemWorkerRpc',
    );
    if (failNextSystemWorkerRpc !== true) {
      return false;
    }

    await this.ctx.storage.delete('failNextSystemWorkerRpc');
    return true;
  }

  async resetNow(): Promise<void> {
    this.ctx.abort('Durable Object reset because its code was updated');
  }
}
