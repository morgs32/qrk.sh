import type { Async } from '@zerospin/core/async/Async';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import type { ManagedRuntime } from 'effect';

export type ISessionRuntimeServices = Async | CuidFactory | MonotonicFactory;

export type IZerospinRuntime<APP_SERVICES = never> =
  ManagedRuntime.ManagedRuntime<
    ISessionRuntimeServices | APP_SERVICES,
    IAnyError
  >;
