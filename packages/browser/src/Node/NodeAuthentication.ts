import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';

import { nodeKey } from './nodeKey.ts';
import type { INodeIdentity, INodeRecovery } from './types.ts';

export type IVerifiedAdmission = {
  snapshot?: INodeRecovery;
  admission: IAdmissionRequest;
  identity: INodeIdentity;
};
type IAuthenticationResult =
  | { status: 'verified'; value: IVerifiedAdmission }
  | { status: 'rejected' }
  | { status: 'unavailable' };

/** Admission providers are tab capabilities; the server establishes identity. */
export class NodeAuthentication {
  private readonly targets = new Map<
    object,
    () => Promise<IAdmissionRequest>
  >();
  private readonly pending = new Map<
    object,
    { generation: number; response: Promise<IAuthenticationResult> }
  >();
  private attempt: Promise<IVerifiedAdmission> | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private suspended = false;

  constructor(
    readonly identity: INodeIdentity,
    readonly verify: (
      admission: IAdmissionRequest,
      signal: AbortSignal,
    ) => Promise<IAuthenticationResult>,
    readonly timeoutMs = 5000,
  ) {}

  register(
    target: object,
    getAdmission: () => Promise<IAdmissionRequest>,
  ): () => void {
    this.targets.set(target, getAdmission);
    return () => {
      this.targets.delete(target);
    };
  }

  authenticate(): Promise<IVerifiedAdmission> {
    if (this.suspended) {
      return Promise.reject(makeZerospinError({ code: 'node-signed-out' }));
    }
    if (this.attempt !== null) return this.attempt;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const attempt = this.runAttempt(controller, generation);
    this.attempt = attempt;
    void attempt
      .finally(() => {
        if (this.attempt === attempt) {
          this.attempt = null;
          this.controller = null;
        }
      })
      .catch(() => undefined);
    return attempt;
  }

  private async runAttempt(
    controller: AbortController,
    generation: number,
  ): Promise<IVerifiedAdmission> {
    const expected = await nodeKey(this.identity);
    if (controller.signal.aborted) {
      throw makeZerospinError({ code: 'node-authentication-cancelled' });
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let remaining = this.targets.size;
      let rejected = false;
      const cleanup = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', cancelled);
      };
      const fail = (code: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(makeZerospinError({ code }));
      };
      const cancelled = () => fail('node-authentication-cancelled');
      const timer = setTimeout(
        () => fail('node-authentication-unavailable'),
        this.timeoutMs,
      );
      controller.signal.addEventListener('abort', cancelled, { once: true });
      if (remaining === 0) {
        fail('node-authentication-unavailable');
        return;
      }
      for (const [target, getAdmission] of this.targets) {
        // Timed-out or frozen capabilities retain one pending call until it settles.
        // A later retry never piles another call onto the same unresponsive tab.
        const pending = this.pending.get(target);
        let response =
          pending?.generation === generation
            ? pending.response
            : pending === undefined
              ? undefined
              : Promise.resolve<IAuthenticationResult>({
                  status: 'unavailable',
                });
        if (response === undefined) {
          response = Promise.resolve()
            .then(getAdmission)
            .then(admission => this.verify(admission, controller.signal))
            .catch((): IAuthenticationResult => ({ status: 'unavailable' }));
          this.pending.set(target, { generation, response });
          const retained = response;
          void response.finally(() => {
            if (this.pending.get(target)?.response === retained) {
              this.pending.delete(target);
            }
          });
        }
        void response
          .then(async result => {
            if (
              settled ||
              generation !== this.generation ||
              !this.targets.has(target)
            ) {
              return;
            }
            if (
              result.status === 'verified' &&
              (await nodeKey(result.value.identity)) === expected
            ) {
              if (
                settled ||
                generation !== this.generation ||
                controller.signal.aborted
              ) {
                return;
              }
              settled = true;
              cleanup();
              resolve(result.value);
              return;
            }
            if (result.status !== 'unavailable') rejected = true;
            remaining -= 1;
            if (remaining === 0) {
              fail(
                rejected
                  ? 'node-authentication-rejected'
                  : 'node-authentication-unavailable',
              );
            }
          })
          .catch(() => {
            remaining -= 1;
            if (remaining === 0) fail('node-authentication-unavailable');
          });
      }
    });
  }

  clear(): void {
    this.suspended = true;
    this.generation += 1;
    this.controller?.abort();
    this.attempt = null;
  }

  /** Re-enable only after a fresh server-verified login to the original identity. */
  async resume(identity: INodeIdentity): Promise<void> {
    const generation = this.generation;
    if ((await nodeKey(identity)) !== (await nodeKey(this.identity))) {
      throw makeZerospinError({
        code: 'node-authentication-identity-mismatch',
      });
    }
    if (generation !== this.generation) {
      throw makeZerospinError({ code: 'node-authentication-cancelled' });
    }
    this.suspended = false;
  }
}
