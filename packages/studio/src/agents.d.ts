declare module 'virtual:zerospin-studio-agents' {
  export const agents: Readonly<
    Record<string, import('@zerospin/core/agent/types').IAgentSession>
  >;
}
