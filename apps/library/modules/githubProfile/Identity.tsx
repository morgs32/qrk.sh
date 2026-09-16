import { brickMutedClass } from "../../components/brick/brickTokens";

export function Identity(props: { name: string | null; login: string }) {
  return (
    <div data-github-profile-json-render="Identity" className="min-w-0 w-full">
      {props.name ? <h3 className="truncate">{props.name}</h3> : null}
      <p className={`truncate ${brickMutedClass}`}>@{props.login}</p>
    </div>
  );
}
