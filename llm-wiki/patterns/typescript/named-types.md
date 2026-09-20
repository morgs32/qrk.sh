# Prefix named types with I

All named type aliases and interfaces in QRK begin with `I`.
Use `ILibraryStandaloneSession` for the type returned by
`createLibraryStandaloneSession`.

Apply this convention to new types and existing types touched by a requested
change. It does not authorize unrelated bulk renames. Prefer an inline shape
for a single-use type rather than introducing a named alias only to satisfy
the naming rule.
