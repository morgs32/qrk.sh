import { SignIn } from "@clerk/nextjs";

import { postAuthPath } from "@/app/(site)/site/[siteId]/routePatterns";

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <SignIn fallbackRedirectUrl={postAuthPath} forceRedirectUrl={postAuthPath} />
    </div>
  );
}
