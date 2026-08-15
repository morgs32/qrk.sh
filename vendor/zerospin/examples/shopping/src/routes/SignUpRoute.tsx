import { SignUp, useAuth } from '@clerk/react-router';
import { Navigate } from 'react-router';

export function SignUpRoute() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-6 py-12">
      <SignUp path="/signup" routing="path" signInUrl="/signin" />
    </div>
  );
}
