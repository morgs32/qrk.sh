import type { Metadata } from "next";
import Link from "next/link";
import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Wordmark } from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Terms of service | QRK.SH",
  description: "Terms for using QRK.SH, its App editor, and related features.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8 text-sm leading-7 sm:px-10 sm:py-12">
      <nav aria-label="Legal pages" className="mb-16 flex flex-wrap items-center justify-between gap-4">
        <Wordmark />
        <UnderlinedLink asChild className="text-[length:inherit]! leading-[inherit]!">
          <Link href="/privacy">Privacy policy →</Link>
        </UnderlinedLink>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of service</h1>
        <p className="mt-4 text-muted-foreground">Effective October 18, 2026.</p>
      </header>

      <article className="space-y-10">
        <section aria-labelledby="terms-service">
          <h2 id="terms-service" className="mb-3 text-lg font-bold">1. Using QRK.SH</h2>
          <p>
            These terms govern your use of QRK.SH, its App editor, and related features.
            QRK lets you create and edit sites and pages using content blocks, uploads, and
            optional third-party content. Features are under active development and may change.
            By using QRK, you agree to these terms. If you do not agree,
            do not use the service. Questions can be sent to{" "}
            <a className="underline underline-offset-4" href="mailto:me@morganatwork.com">me@morganatwork.com</a>.
          </p>
        </section>

        <section aria-labelledby="terms-account">
          <h2 id="terms-account" className="mb-3 text-lg font-bold">2. Your account</h2>
          <p>
            You must have the legal capacity to agree to these terms and, if acting for an
            organization, authority to bind it. Provide accurate account information and keep
            your sign-in credentials secure. You are responsible for activity you authorize
            through your account. Tell us promptly if you believe it has been compromised.
            Clerk provides authentication, including optional Google sign-in. QRK currently
            requires a username that cannot be changed after selection.
          </p>
        </section>

        <section aria-labelledby="terms-content">
          <h2 id="terms-content" className="mb-3 text-lg font-bold">3. Your content and permission to host it</h2>
          <p>
            You retain ownership of content you submit. You give QRK permission to store,
            reproduce, process, and display that content only as needed to operate the features
            you use, including hosting images, rendering pages, making publishing snapshots,
            and sending inputs to an optional provider you choose to use. You confirm that you
            have the rights and permissions needed for this use.
          </p>
          <p className="mt-4">
            Uploaded images have public URLs and can be retrieved by anyone who knows the URL,
            even if the associated page is unpublished. Removing a block, replacing an image,
            unpublishing, or deleting an authentication account does not automatically erase
            stored files or historical snapshots. The hosting permission continues for retained
            copies only as needed for the service and the retention described in our{" "}
            <UnderlinedLink asChild className="text-[length:inherit]! leading-[inherit]!">
              <Link href="/privacy">privacy policy</Link>
            </UnderlinedLink>.
            Keep your own copies of important content.
          </p>
        </section>

        <section aria-labelledby="terms-conduct">
          <h2 id="terms-conduct" className="mb-3 text-lg font-bold">4. Acceptable use</h2>
          <p>
            Do not use QRK for unlawful activity, fraud, impersonation, harassment, malware,
            or content that infringes another person&apos;s rights. Do not attempt to bypass access
            controls, interfere with other users, or disrupt the service. Do not upload personal
            or confidential information without the necessary permission. We may restrict
            access or remove content to address violations, security risks, or legal requirements.
            Where practical and legally permitted, we will explain the restriction and how to
            contact us about it.
          </p>
        </section>

        <section aria-labelledby="terms-providers">
          <h2 id="terms-providers" className="mb-3 text-lg font-bold">5. Third-party content and AI</h2>
          <p>
            Maps, social profiles, embeds, link previews, and sign-in providers have their own
            terms and availability. You are responsible for having permission to use content
            retrieved through those features. QRK does not grant rights to third-party material.
            If you request AI generation, relevant inputs are sent to the AI provider as described
            in the privacy policy. Generated output may be inaccurate, incomplete, or unsuitable;
            review it before use or publication. Do not rely on it as professional advice.
          </p>
        </section>

        <section aria-labelledby="terms-availability">
          <h2 id="terms-availability" className="mb-3 text-lg font-bold">6. Availability, warranties, and responsibility</h2>
          <p>
            To the extent permitted by law, QRK is provided as available, without promises of
            uninterrupted operation, error-free results, permanent storage, or fitness for a
            particular purpose. Features may be changed or discontinued. You are responsible
            for reviewing your content and keeping independent backups. Nothing in these terms
            excludes a warranty, liability, remedy, or consumer right that applicable law does
            not allow us to exclude.
          </p>
        </section>

        <section aria-labelledby="terms-ending">
          <h2 id="terms-ending" className="mb-3 text-lg font-bold">7. Ending use and changes to these terms</h2>
          <p>
            You may stop using QRK at any time. Account controls and data-request options are
            described in the privacy policy; account deletion and QRK content deletion are
            separate processes. We may suspend or end access for the reasons in these terms.
            If the terms change, we will publish the revised version here with an updated
            effective date and provide any notice required by law. Contact the email above
            with questions about access, content, or these terms.
          </p>
        </section>
      </article>

      <footer className="mt-16 border-t pt-6 text-muted-foreground">
        <UnderlinedLink asChild className="text-[length:inherit]! leading-[inherit]!">
          <Link href="/privacy">Read the privacy policy</Link>
        </UnderlinedLink>
      </footer>
    </main>
  );
}
