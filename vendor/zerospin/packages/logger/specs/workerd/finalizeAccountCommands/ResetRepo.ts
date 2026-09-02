import { DurableObject } from 'cloudflare:workers';

// The spec stores one transport-reset request here so the SystemApi fixture can
// consume it exactly once before retrying the real named Worker hop.
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
}
