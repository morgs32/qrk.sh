import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-6 py-12">
      <SignIn signUpUrl="/signup" />
    </div>
  );
}
