export type IOpfsBackupControlMessage =
  | Readonly<{
      type: 'RegisterClient';
      port: MessagePort;
    }>
  | Readonly<{
      type: 'InstallLeader';
      port: MessagePort;
    }>;
