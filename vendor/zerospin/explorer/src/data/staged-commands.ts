import type { ITypeDeclaration } from '../types';

export const declarations: readonly ITypeDeclaration[] = [
  {
    id: 'aggregate-staged-command',
    name: 'ISessionCommand<COMMAND, RESULT>',
    variableName: 'stagedCommand',
    owner: 'browser',
    repoId: 'aggregate-session',
    description:
      'Successful aggregate stageCommand result. Carries the decoded command payload, local session occurrence and original optimistic result. Staging retains Date timestamps and the inserted, updated, deleted and applied operation material in stagedDelta.',
    source: {
      path: 'packages/core/src/contracts/types.ts',
      line: 348,
      note: 'Composes ICommand and ISessionCommandInput with StagingResultSchema.Type.',
    },
    properties: [
      { name: 'id', type: "COMMAND['id']" },
      { name: 'commandName', type: "COMMAND['commandName']" },
      { name: 'contractVersion', type: "COMMAND['contractVersion']" },
      { name: 'payload', type: "COMMAND['payload']" },
      { name: 'aggregateId', type: 'string' },
      { name: 'aggregateName', type: 'string' },
      { name: 'claims', type: 'Readonly<Record<string, unknown>>' },
      { name: 'actorName', type: 'string' },
      { name: 'actorVersion', type: 'string' },
      { name: 'sessionName', type: 'string' },
      { name: 'sessionId', type: 'ISessionId' },
      {
        name: 'pushIndex',
        type: 'number | null',
        description: 'Null when stageCommand first returns the local command.',
      },
      { name: 'sessionIndex', type: 'number' },
      {
        name: 'staging',
        type: "Omit<typeof StagingResultSchema.Type, 'result'> & { readonly result: RESULT }",
        description:
          'result: RESULT; startedAt and completedAt: Date; stagedDelta: inserted, updated, deleted and operations.',
      },
    ],
  },
  {
    id: 'service-staged-command',
    name: 'IServiceSessionCommand<RESULT>',
    variableName: 'stagedCommand',
    owner: 'browser',
    repoId: 'session',
    description:
      'Successful stageServiceCommand result, returned after durable Node acceptance. Carries an encoded string payload and the original optimistic result. Encoded staging uses string timestamps; session occurrence and Node identity belong to the journals.',
    source: {
      path: 'packages/core/src/serviceSession/types.ts',
      line: 148,
      note: 'Composes IServiceNodeCommandInput with StagingResultSchema.Encoded.',
    },
    properties: [
      { name: 'id', type: "InferIdFromAbbreviation<'cmd'>" },
      { name: 'commandName', type: 'string' },
      { name: 'contractVersion', type: 'string' },
      { name: 'payload', type: 'string' },
      { name: 'serviceName', type: 'string' },
      { name: 'actorName', type: 'string' },
      { name: 'actorVersion', type: 'string' },
      { name: 'sessionName', type: 'string' },
      { name: 'claims', type: 'Readonly<Record<string, unknown>>' },
      {
        name: 'staging',
        type: "Omit<typeof StagingResultSchema.Encoded, 'result'> & { readonly result: RESULT }",
        description:
          'result: RESULT; startedAt and completedAt: string; stagedDelta: encoded inserted, updated, deleted and operations.',
      },
    ],
  },
];
