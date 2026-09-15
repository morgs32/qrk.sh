export function Identity(props: { name: string | null; login: string }) {
  return (
    <div data-github-profile-json-render="Identity" className="min-w-0 w-full">
      {props.name ? (
        <p className="truncate text-sm font-medium text-zinc-900">{props.name}</p>
      ) : null}
      <p className="truncate text-xs text-zinc-500">@{props.login}</p>
    </div>
  );
}
