export function Login(props: { login: string }) {
  return (
    <p data-github-profile-json-render="Login" className="min-w-0 truncate">
      @{props.login}
    </p>
  );
}
