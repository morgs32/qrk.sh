import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type { ISession, ISessionId } from '@zerospin/core/session/types';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';

export type IModifierKey = 'Alt' | 'Control' | 'Meta' | 'Shift' | 'CtrlOrMeta';
export type IKeyboardKey = IModifierKey | (string & {});
export type IZerospinDevtoolsTheme = 'light' | 'dark';

export type ITriggerPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'middle-left'
  | 'middle-right';

export type IZerospinDevtoolsConfig = {
  defaultOpen?: boolean;
  hideUntilHover?: boolean;
  position?: ITriggerPosition;
  panelLocation?: 'top' | 'bottom';
  openHotkey?: Array<IKeyboardKey>;
  theme?: IZerospinDevtoolsTheme;
  triggerHidden?: boolean;
};

export type IDevtoolsStore = {
  settings: {
    defaultOpen: boolean;
    hideUntilHover: boolean;
    position: ITriggerPosition;
    panelLocation: 'top' | 'bottom';
    openHotkey: Array<IKeyboardKey>;
    theme: IZerospinDevtoolsTheme;
    triggerHidden: boolean;
  };
  state: {
    height: number;
    persistOpen: boolean;
  };
};

/** Profiler row stub; extend when wiring data into the store. */
export interface IProfilerProfile {
  readonly id: string;
  readonly recordedAt: number;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface IDevtoolsAggregateSessionEntry {
  readonly session: ISession;
  readonly getPushPaused: () => Promise<IEncodedResult<boolean, IAnyErrorJson>>;
  readonly setPushPaused: (props: {
    pushPaused: boolean;
  }) => Promise<IEncodedResult<void, IAnyErrorJson>>;
  readonly pushNow: () => Promise<
    IEncodedResult<
      | Readonly<{ status: 'empty' }>
      | Readonly<{ status: 'pushed' }>
      | Readonly<{
          status: 'retry-exhausted';
          failure: IAnyErrorJson;
        }>,
      IAnyErrorJson
    >
  >;
}

/**
 * Generic-erased, read-only service session view retained by DevTools.
 * Every callback closes over the original typed service session, so the
 * heterogeneous registry never widens its invariant Zustand StoreApi.
 */
export interface IDevtoolsServiceSessionEntry {
  readonly sessionId: ISessionId;
  readonly serviceName: string;
  readonly frontendName: string;
  readonly modelNames: readonly string[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly getUserId: () => string | null;
  readonly getIsInitialized: () => boolean;
  readonly getSessionStatus: () => ReturnType<
    IServiceSession['store']['getState']
  >['sessionStatus'];
  readonly getBackupState: () => ReturnType<
    IServiceSession['store']['getState']
  >['backupState'];
  readonly getTelemetry: () => ITelemetryBatch;
  readonly getServiceIndex: () => number | null;
  readonly getServiceFrontendIndex: () => number | null;
  readonly getModelAttributes: (
    modelName: string,
  ) => Readonly<Record<string, unknown>> | undefined;
  readonly readModelRows: (modelName: string) => unknown;
  readonly clearTelemetry: () => void;
}

export type IZerospinDevtoolsStoreState = {
  readonly aggregateSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsAggregateSessionEntry
  >;
  readonly serviceSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsServiceSessionEntry
  >;
  readonly profiles: ReadonlyArray<IProfilerProfile>;
  addAggregateSession: (entry: IDevtoolsAggregateSessionEntry) => void;
  removeAggregateSession: (sessionId: ISessionId) => void;
  addServiceSession: <FRONTEND extends IServiceFrontendController>(entry: {
    readonly session: IServiceSession<FRONTEND>;
  }) => void;
  removeServiceSession: (sessionId: ISessionId) => void;
};
