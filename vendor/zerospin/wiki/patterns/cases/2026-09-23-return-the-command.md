# Return the command

## Smell

A result wraps the domain object, repeats its id under another name, or renames a real field to a generic word.

## Pattern

See [return-the-domain-object.md](../apis/return-the-domain-object.md).

## When to apply

Admission was about to return `{ commandId, aggregateIndex, command }`, and `aggregateIndex` / `serviceIndex` were described as a "position". The obvious result is the retained command. Its id is `command.id`. `aggregateIndex` and `serviceIndex` are fields of that command.
