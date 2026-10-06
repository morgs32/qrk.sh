# @zerospin/react

React session hooks and shape-generated forms.

## Session initialization

Use `useInitializeAggregateSession` for an aggregate browser session and
`useInitializeServiceSession` for a service browser session. Both own initialization
after React commit, report readiness, and dispose the session on cleanup.

Both hooks register the same error callbacks with the application's existing
notification UI:

```tsx
useInitializeAggregateSession({
  session: studentSession,
  claims,
  onStageFailure: ({ failure }) => toast.error(failure.message),
  onAdmissionFailure: ({ failure }) => toast.error(failure.message),
  onExecutionFailure: ({ failure }) => toast.error(failure.message),
  onSharedWorkerConnectionFailure: ({ message }) => toast.error(message),
  onSharedWorkerPersistenceFailure: ({ message }) => toast.error(message),
  onAuthenticationFailure: ({ message }) => toast.error(message),
  onServerProtocolFailure: ({ message }) => toast.error(message),
});
```

Staging callbacks receive `{ contractName, failure }`. Admission and execution
callbacks receive `{ commandId, commandName, failure }`, with the failure from
`command.admission` or `command.execution`. Only the activation that staged a
command receives its later rejection. Callbacks see the committed projection,
including rollback. Ordinary offline retry and deliberate sign-out stay quiet.
Other blocks notify once per episode; a new activation does not replay historical
errors. Connection means the tab could not attach to its SharedWorker; persistence
means the worker's local storage failed. Authentication and server protocol
failures refer to the worker's server synchronization.

Callbacks can change on rerender without reinitialization. The owning hook
unsubscribes before disposal; a competing mount registers no listeners. Service
sessions use their own initializer with the same callback names:

```tsx
const { isInitialized } = useInitializeServiceSession({
  session: catalogSession,
  claims: {},
  onStageFailure: ({ failure }) => toast.error(failure.message),
  onAdmissionFailure: ({ failure }) => toast.error(failure.message),
  onExecutionFailure: ({ failure }) => toast.error(failure.message),
  onSharedWorkerConnectionFailure: ({ message }) => toast.error(message),
  onSharedWorkerPersistenceFailure: ({ message }) => toast.error(message),
  onAuthenticationFailure: ({ message }) => toast.error(message),
  onServerProtocolFailure: ({ message }) => toast.error(message),
});
```

Credential-based sessions pass `getCredentials` and optional `expectedClaims`
in place of `claims`. The hooks use the latest credentials callback without
reinitializing. Replacing the session disposes the old owner and starts the new
one; stale callbacks and initialization failures cannot reach the replacement.
Imperative aggregate and service callers can use the corresponding
`session.onStageFailure(handler)` and other `on…Failure(handler)` subscriptions;
each returns an unsubscribe. The hook removes its listeners at cleanup. Originating
commands and blocking episodes belong to the browser activation and end when it
is disposed. Observer exceptions are logged and cannot change command results.

Local staging failures retain no command and consume no submission position.
Aggregate forms branch on the synchronous staging result to retain or close their
draft. Aggregate delivery failures are reported by the activation after local
commit and preserve the successful staging result.

Service forms await `stageServiceCommand` and branch on its returned result.
Uncertain Node acceptance can return a failure while retaining the locally
committed service command. Acceptance failures and result-decoding failures after
acceptance do not fire `onStageFailure`.

Release a form's submission guard when its command call returns a failure or throws an
unexpected exception, then rethrow that exception. On success, keep the guard
until the draft closes to prevent a second submission. Operations such as
`session.makeId()` happen before staging and need their own narrow error handling.
Unexpected precommit exceptions notify once before rethrowing.

```tsx
const result = stageCommand({ session: studentSession, contractName, payload });
if (result._tag === 'Success') closeDraft();
```

## DevTools

Mount one `ZerospinDevtoolsLoader` near the application root so the DevTools
shell stays mounted across route changes. The component is available from
`@zerospin/react` and its defining module:

```tsx
import type { ReactNode } from 'react';
import { ZerospinDevtoolsLoader } from '@zerospin/react/ZerospinDevtoolsLoader';

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && <ZerospinDevtoolsLoader />}
      </body>
    </html>
  );
}
```

The caller chooses when to include DevTools; the component has no environment
gate. For Vite, use `import.meta.env.DEV` as the development condition.

`defaultOpen` defaults to `false` and is read once when the component mounts.
Changing it while mounted does not toggle or reload the shell; remount the
component to apply a different initial value. Initialization runs after React
commit and skips effects canceled during StrictMode replay. Cleanup disposes
the shell, including a load that finishes after unmount. Load failures are
logged without interrupting the application.

`loadDevtools({ defaultOpen })` remains available for imperative callers. Await
its returned handle to call `open()` and release the shell with `dispose()`
when its owner ends.

## Shape forms

```tsx
import { ShapeForm } from '@zerospin/react/primitives';
import '@zerospin/react/primitives.css';

<ShapeForm
  shape={contract.payload}
  defaultValues={payload}
  onSubmit={submitPayload}
/>;
```

`shape` is the primitive descriptor map authored with `@zerospin/shapes`.
`defaultValues` is optional and accepts a partial decoded row. Omitted fields
use their descriptor defaults when present; otherwise text, identifiers,
numbers, dates, JSON, and enums start as blank drafts, and booleans start
unchecked. Explicit null and falsy values override descriptor defaults.
The shape determines the complete value type
received by `onSubmit`, including enum literals, prefixed IDs, nullable values,
JSON data, and `Date` instances. The callback can return a promise.

The form owns its TanStack state, renders labels from field names, and validates
the complete row on submission through `makeEffectSchema(shape)`. Unfinished
numbers, ISO timestamps, and JSON remain editable drafts and prevent submission.
Nullable fields have an explicit null control; empty text remains a distinct
value. Dates use ISO timestamp text so their time and milliseconds survive
editing. References use string or numeric inputs according to the referenced
column; they do not load related rows.

Initial values are encoded through the shape's codec, including asynchronous
JSON codecs. Submission decodes through that same codec. Initialization and
submission errors are displayed, and failed submissions retain the edits.
The shape and `defaultValues` initialize the form once; change its React `key`
to start a different form. `disabled` can change while the form is mounted; it
disables every input, null control, and Submit, and prevents submission even
when asynchronous validation is already running. The form retains drafts while
disabled. An empty `shape` still renders Submit and submits `{}`.
Unmounting or changing the form's key prevents an unfinished validation or
decoding operation from invoking the old form's submission callback.

`primitiveInputsMap` exposes the default draft input components by
`PrimitiveKind`. `ShapeInputs` is the form's internal renderer.

Import `primitives.css` once in the application's stylesheet entry or root
layout. It contains compiled StyleX rules for the adapted
[shadcn-cssinjs](https://www.shadcn-cssinjs.com/) controls. Consumers need no
StyleX compiler. Styles use the usual shadcn CSS variables with fallback values,
and do not install a global reset. License attribution lives beside the controls.

The package's `lib` and `watch` commands compile TypeScript and then publish the
primitives JavaScript and CSS together. Run their Nx tasks from the workspace:

```sh
pnpm nx run @zerospin/react:lib
pnpm nx run @zerospin/react:test
pnpm nx run @zerospin/react:primitives:check
```
