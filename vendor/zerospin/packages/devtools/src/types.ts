import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
} from "@zerospin/core/contracts/types";
import type { ISession, ISessionId } from "@zerospin/core/session/types";

export type IModifierKey = "Alt" | "Control" | "Meta" | "Shift" | "CtrlOrMeta";
export type IKeyboardKey = IModifierKey | (string & {});
export type IZerospinDevtoolsTheme = "light" | "dark";

export type ITriggerPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "middle-left"
  | "middle-right";

export type IZerospinDevtoolsConfig = {
  defaultOpen?: boolean;
  hideUntilHover?: boolean;
  position?: ITriggerPosition;
  panelLocation?: "top" | "bottom";
  openHotkey?: Array<IKeyboardKey>;
  requireUrlFlag?: boolean;
  urlFlag?: string;
  theme?: IZerospinDevtoolsTheme;
  triggerHidden?: boolean;
};

export type IDevtoolsStore = {
  settings: {
    defaultOpen: boolean;
    hideUntilHover: boolean;
    position: ITriggerPosition;
    panelLocation: "top" | "bottom";
    openHotkey: Array<IKeyboardKey>;
    requireUrlFlag: boolean;
    urlFlag: string;
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

export interface IDevtoolsSessionEntry {
  readonly session: ISession;
  readonly pushStagedCommands: () => Promise<
    Readonly<{
      pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
      pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
      failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
    }>
  >;
}

export type IZerospinDevtoolsStoreState = {
  readonly sessionsById: ReadonlyMap<ISessionId, IDevtoolsSessionEntry>;
  readonly profiles: ReadonlyArray<IProfilerProfile>;
  readonly sharedWorkerUserApi: unknown | null;
  addSession: (entry: IDevtoolsSessionEntry) => void;
  removeSession: (sessionId: ISessionId) => void;
  setSharedWorkerUserApi: (sharedWorkerUserApi: unknown | null) => void;
};
