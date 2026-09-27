import { AggregateActorCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ServiceActorCommandSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import { makeZerospinError } from '@zerospin/error';
import { Schema } from 'effect';

import { isNodeNetworkUnavailable } from './isNodeNetworkUnavailable.ts';
import type { INodeCommand, Node } from './Node.ts';
import type { NodeAuthentication } from './NodeAuthentication.ts';
import { nodeNetwork } from './nodeNetwork.ts';
import type { INodeRequest } from './nodeRequest.ts';

/** Network and authentication never run inside Node's database serialization boundary. */
export class NodeSynchronization {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private pending: {
    command: INodeCommand;
    resolve(): void;
    reject(error: unknown): void;
  } | null = null;
  private pushing: Promise<{ status: 'empty' | 'pushed' }> | null = null;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    readonly node: Node,
    readonly request: INodeRequest,
    readonly authentication: NodeAuthentication,
  ) {}

  enable(): void {
    this.stopped = false;
  }

  resume(): Promise<void> {
    if (this.stopped) {
      return Promise.reject(makeZerospinError({ code: 'node-signed-out' }));
    }
    if (this.connecting !== null) return this.connecting;
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    const connecting = this.connect();
    this.connecting = connecting;
    const generation = this.generation;
    void connecting
      .catch(async error => {
        if (generation !== this.generation) return;
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'node-authentication-rejected'
        ) {
          await this.node.rejectAuthentication();
          this.node.connectionState('blocked', error);
          return;
        }
        if (this.stopped) return;
        const code =
          error instanceof Error && 'code' in error ? error.code : null;
        const retryable = [
          'node-authentication-unavailable',
          'node-subscription-timeout',
          'node-subscription-closed',
          'node-snapshot-required',
          'node-admission-uncertain',
          'node-offline',
        ].includes(String(code));
        if (!retryable && !isNodeNetworkUnavailable(error)) {
          this.node.connectionState('blocked', error);
          return;
        }
        this.node.connectionState('offline', error);
        if (!this.stopped && this.retry === null) {
          this.retry = setTimeout(() => {
            this.retry = null;
            void this.resume().catch(() => undefined);
          }, 3000);
        }
      })
      .finally(() => {
        if (this.connecting === connecting) this.connecting = null;
      });
    return connecting;
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    this.node.connectionState('authenticating');
    const verified = await this.authentication.authenticate();
    if (generation !== this.generation || this.stopped) return;
    await this.node.authenticated(
      verified.identity,
      () => generation === this.generation && !this.stopped,
    );
    const network = nodeNetwork(this.request, verified.admission);
    const before = await this.node.snapshot();
    const snapshot = await network.snapshot(before.metadata.nodeId);
    if (generation !== this.generation || this.stopped) return;
    const checkpoint =
      'executedIndex' in snapshot
        ? {
            executedIndex: snapshot.executedIndex,
            executedHash: snapshot.executedHash,
            resolvedThrough: snapshot.resolvedThrough,
          }
        : {
            executedIndex: snapshot.serviceIndex,
            executedHash: snapshot.serviceHash,
            resolvedThrough: 0,
          };
    await this.node.beginRecovery({
      ...checkpoint,
      aggregateIndex:
        'aggregateIndex' in snapshot ? snapshot.aggregateIndex : 0,
      resources: snapshot.resources,
    });
    const ticket = await network.ticket();
    if (generation !== this.generation || this.stopped) return;
    const url = new URL(this.request.apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname =
      this.request.kind === 'aggregate'
        ? '/ws-aggregate-session-commands'
        : '/ws-service-session-commands';
    url.search = '';
    url.searchParams.set('ticket', ticket.ticket);
    const socket = new WebSocket(url);
    this.socket = socket;
    let messages: Promise<void> = Promise.resolve();
    await new Promise<void>((resolve, reject) => {
      let live = false;
      const timeout = setTimeout(() => {
        reject(makeZerospinError({ code: 'node-subscription-timeout' }));
        socket.close();
      }, 15000);
      socket.addEventListener('open', () => {
        socket.send(
          JSON.stringify(
            this.request.kind === 'aggregate'
              ? {
                  nodeId: before.metadata.nodeId,
                  nodeIndex: before.metadata.outcomeIndex,
                  executedIndex: checkpoint.executedIndex,
                  executedHash: checkpoint.executedHash,
                }
              : {
                  serviceIndex: checkpoint.executedIndex,
                  serviceHash: checkpoint.executedHash,
                },
          ),
        );
      });
      socket.addEventListener('message', event => {
        messages = messages
          .then(async () => {
            if (this.socket !== socket || this.stopped) return;
            const message = Schema.decodeUnknownSync(
              Schema.fromJsonString(
                Schema.StructWithRest(Schema.Struct({ type: Schema.String }), [
                  Schema.Record(Schema.String, Schema.Unknown),
                ]),
              ),
            )(event.data);
            if (message.type === 'state-required') {
              throw makeZerospinError({ code: 'node-snapshot-required' });
            }
            if (message.type === 'aggregateActorCommand') {
              const command = Schema.decodeUnknownSync(
                AggregateActorCommandSchema,
              )(message.command);
              await this.node.receiveCommand(command);
            } else if (message.type === 'serviceActorCommand') {
              const command = Schema.decodeUnknownSync(
                ServiceActorCommandSchema,
              )(message.command);
              await this.node.receiveCommand({
                id: command.id,
                nodeId: null,
                nodeIndex: null,
                aggregateIndex: 0,
                executedIndex: command.serviceIndex,
                executedHash: command.serviceHash,
                actorDelta: command.actorDelta,
                admission: null,
                execution: null,
              });
            } else if (message.type === 'aggregateCommandAdmission') {
              const receipt = Schema.decodeUnknownSync(
                Schema.Struct({
                  commandId: Schema.String,
                  result: Schema.Unknown,
                }),
              )(message);
              if (receipt.commandId !== this.pending?.command.id) {
                throw makeZerospinError({
                  code: 'node-admission-reply-mismatch',
                });
              }
              const result = Schema.decodeUnknownSync(
                Schema.Union([
                  Schema.Struct({
                    _tag: Schema.Literal('Success'),
                    success: Schema.Struct({
                      id: Schema.TemplateLiteral(['cmd_', Schema.String]),
                      nodeIndex: Schema.Number,
                      aggregateIndex: Schema.Number,
                      admission: Schema.toEncoded(AdmissionResultSchema),
                    }),
                  }),
                  Schema.Struct({
                    _tag: Schema.Literal('Failure'),
                    failure: Schema.Unknown,
                  }),
                ]),
              )(receipt.result);
              const pending = this.pending;
              this.pending = null;
              if (result._tag === 'Failure') {
                const mismatch = Schema.decodeUnknownOption(
                  Schema.Struct({
                    code: Schema.Literal('node-admission-index-mismatch'),
                    extra: Schema.Struct({ expectedNodeIndex: Schema.Number }),
                  }),
                )(result.failure);
                if (
                  mismatch._tag === 'Some' &&
                  mismatch.value.extra.expectedNodeIndex <
                    pending.command.nodeIndex
                ) {
                  try {
                    await this.node.reconcileAdmission(
                      mismatch.value.extra.expectedNodeIndex,
                    );
                    pending.resolve();
                  } catch (error) {
                    pending.reject(error);
                    this.node.connectionState('blocked', error);
                  }
                } else {
                  pending.reject(result.failure);
                  this.node.connectionState('blocked', result.failure);
                }
              } else {
                await this.node.admitted(result.success);
                pending.resolve();
              }
            } else if (message.type === 'replay-complete') {
              const through = Schema.decodeUnknownSync(
                Schema.Number.check(
                  Schema.isInt(),
                  Schema.isGreaterThanOrEqualTo(0),
                ),
              )(
                this.request.kind === 'aggregate'
                  ? message.executedIndex
                  : message.serviceIndex,
              );
              const committed = await this.node.snapshot();
              if (
                committed.state.synchronization === 'recovering' ||
                committed.metadata.executedIndex !== through
              ) {
                throw makeZerospinError({ code: 'node-replay-incomplete' });
              }
              clearTimeout(timeout);
              live = true;
              this.node.connectionState('online');
              resolve();
              void this.push().catch(() => undefined);
            }
          })
          .catch(error => {
            this.node.connectionState('offline', error);
            socket.close();
            reject(error);
          });
      });
      socket.addEventListener('error', () => {
        socket.close();
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        if (generation !== this.generation) return;
        if (this.socket === socket) this.socket = null;
        this.pending?.reject(
          makeZerospinError({ code: 'node-admission-uncertain' }),
        );
        this.pending = null;
        if (!live) {
          reject(makeZerospinError({ code: 'node-subscription-closed' }));
        }
        if (!this.stopped && generation === this.generation) {
          this.node.connectionState('offline');
          if (this.retry === null) {
            this.retry = setTimeout(() => {
              this.retry = null;
              void this.resume().catch(() => undefined);
            }, 3000);
          }
        }
      });
    });
  }

  push(manual = false): Promise<{ status: 'empty' | 'pushed' }> {
    if (this.pushing !== null) return this.pushing;
    const pushing = (async () => {
      await this.resume();
      for (;;) {
        const command = await this.node.nextPush(manual);
        if (command === null) return { status: 'empty' as const };
        const socket = this.socket;
        if (socket?.readyState !== WebSocket.OPEN) {
          throw makeZerospinError({ code: 'node-offline' });
        }
        const {
          id,
          nodeId,
          nodeIndex,
          commandName,
          payload,
          contractVersion,
          aggregateId,
          aggregateName,
          actorName,
          actorVersion,
          sessionName,
          claims,
        } = command;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.close();
            reject(makeZerospinError({ code: 'node-admission-uncertain' }));
          }, 15000);
          this.pending = {
            command,
            resolve: () => {
              clearTimeout(timeout);
              resolve();
            },
            reject: error => {
              clearTimeout(timeout);
              reject(error);
            },
          };
          socket.send(
            JSON.stringify({
              type: 'pushAggregateCommand',
              command: {
                id,
                nodeId,
                nodeIndex,
                commandName,
                payload,
                contractVersion,
                aggregateId,
                aggregateName,
                actorName,
                actorVersion,
                sessionName,
                claims,
                systemName: this.request.systemName,
              },
            }),
          );
        });
        if (manual) return { status: 'pushed' as const };
      }
    })();
    this.pushing = pushing;
    void pushing
      .finally(() => {
        if (this.pushing === pushing) this.pushing = null;
      })
      .catch(() => undefined);
    return pushing;
  }

  stop(): void {
    this.stopped = true;
    this.generation += 1;
    this.connecting = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.authentication.clear();
    this.pending?.reject(makeZerospinError({ code: 'node-signed-out' }));
    this.pending = null;
    this.socket?.close();
    this.socket = null;
  }
}
