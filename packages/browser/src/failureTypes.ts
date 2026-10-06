import type { IAnyError, IRecognizedFailure } from '@zerospin/error';

export type ISessionCommandFailure = Readonly<{
  commandId: string;
  commandName: string;
  failure: IRecognizedFailure<IAnyError>;
}>;

export type IBrowserSessionFailureCallbacks = {
  onAdmissionFailure?: (event: ISessionCommandFailure) => void;
  onExecutionFailure?: (event: ISessionCommandFailure) => void;
  onSharedWorkerConnectionFailure?: (event: { message: string }) => void;
  onSharedWorkerPersistenceFailure?: (event: { message: string }) => void;
  onAuthenticationFailure?: (event: { message: string }) => void;
  onServerProtocolFailure?: (event: { message: string }) => void;
};

export type IBrowserSessionFailureSubscriptions = {
  [NAME in keyof IBrowserSessionFailureCallbacks]-?: (
    handler: NonNullable<IBrowserSessionFailureCallbacks[NAME]>,
  ) => () => void;
};
