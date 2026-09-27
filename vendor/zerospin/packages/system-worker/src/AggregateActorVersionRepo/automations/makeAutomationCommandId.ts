/** Length-unambiguous identity, encoded within the existing cmd_ identifier format. */
export const makeAutomationCommandId = (props: {
  commandId: string;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    actorPath: string;
  };
  automationName: string;
}): `cmd_${string}` => {
  const { key, commandId, automationName } = props;
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      key.systemId,
      key.aggregateId,
      key.aggregateName,
      key.aggregateVersion,
      key.actorName,
      key.actorVersion,
      key.actorPath,
      automationName,
      commandId,
    ]),
  );
  return `cmd_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
};
