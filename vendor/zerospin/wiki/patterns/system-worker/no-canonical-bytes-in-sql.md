# Never store canonical bytes in SQL

Storing canonical bytes of anything in a SQL database is absolutely prohibited.
This includes admission records, command histories, outboxes, replica projection
checkpoints, and browser SQL journals. A different column name or SQL type does
not make a canonical JSON string, text value, or blob acceptable.

Finding or proposing such storage must prompt a deep architectural design
discussion before implementing the affected design. Trace the authoritative
owner, all readers and writers, and the exact identity, replay, ordering, or
recovery invariant the stored bytes supposedly enforce. Investigate whether the
checkpoint or comparison is needed and which owner should enforce it.

Do not automatically replace `canonicalBytes` with a hash or fingerprint. Do not
rename the column, hide it in another JSON envelope, or preserve it merely
because an existing test expects it. Command retry identity is the command id.
Admission returns the retained command. See
[return the domain object](../apis/return-the-domain-object.md).

For command storage, persist the command's fields as the row. JSON-valued fields
such as payload, delta, and identity do not justify a canonical-byte copy
of the enclosing command. Preserving command information across owners does
not authorize persisting a whole-command serialization.
