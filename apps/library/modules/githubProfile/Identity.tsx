import { brickMutedClass } from "../../components/brick/brickTokens";

export function Identity(props: { name: string | null; login: string }) {
  return (
    <div data-github-profile-json-render="Identity" className="min-w-0 w-full">
      {props.name ? <p className="truncate font-medium">{props.name}</p> : null}
      <p className={`truncate ${brickMutedClass}`}>@{props.login}</p>
    </div>
  );
}
