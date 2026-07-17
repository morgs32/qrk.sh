import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-6 py-12">
      <SignUp signInUrl="/signin" />
    </div>
  );
}
