import { ClerkProvider } from '@clerk/react-router';
import { Outlet } from 'react-router';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Set VITE_CLERK_PUBLISHABLE_KEY for the shopping app.');
}

export function RootRoute() {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl="/signin"
      signUpUrl="/signup"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <Outlet />
    </ClerkProvider>
  );
}
