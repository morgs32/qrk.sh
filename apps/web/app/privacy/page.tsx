import type { Metadata } from "next";
import { UnderlinedLink } from "@/components/UnderlinedLink";
import { Wordmark } from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Privacy policy | QRK.SH",
  description: "How QRK.SH handles account information, content, uploads, and service providers.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8 text-sm leading-7 sm:px-10 sm:py-12">
      <nav aria-label="Legal pages" className="mb-16 flex flex-wrap items-center justify-between gap-4">
        <Wordmark />
        <UnderlinedLink className="text-[length:inherit]! leading-[inherit]!" href="/terms">Terms of service →</UnderlinedLink>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy policy</h1>
        <p className="mt-4 text-muted-foreground">Effective October 18, 2026.</p>
      </header>

      <article className="space-y-10">
        <section aria-labelledby="privacy-about">
          <h2 id="privacy-about" className="mb-3 text-lg font-bold">1. About this policy</h2>
          <p>
            QRK.SH helps you create and edit sites and pages from content blocks. This policy
            explains how QRK.SH handles information when you use its website, Studio, and related
            features. Contact us at{" "}
            <a className="underline underline-offset-4" href="mailto:me@morganatwork.com">me@morganatwork.com</a>
            {" "}with privacy questions or requests.
          </p>
        </section>

        <section aria-labelledby="privacy-account">
          <h2 id="privacy-account" className="mb-3 text-lg font-bold">2. Accounts and Google sign-in</h2>
          <p>
            Clerk manages account registration, sign-in, and authentication. If you choose Google
            sign-in, Google provides basic identity information, including your account identifier,
            email address, name, and profile picture, to Clerk. QRK associates your content with your
            Clerk user identifier. Your username is required and currently cannot be changed.
          </p>
          <p className="mt-4">
            We request only basic identity permissions: OpenID, email, and profile. We use Google
            account information to create and authenticate your account, display account details,
            and maintain account security. We do not request access to Gmail, Drive, or Calendar.
            We do not sell Google user data, use it for advertising, or use it to train AI models.
            Our use and transfer of information received from Google APIs will comply with the{" "}
            <a className="underline underline-offset-4" href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements.
          </p>
        </section>

        <section aria-labelledby="privacy-content">
          <h2 id="privacy-content" className="mb-3 text-lg font-bold">3. Content, uploads, and browser storage</h2>
          <p>
            We store content you submit, such as site and page names, descriptions, links, text,
            layouts, images, and publishing snapshots. Uploaded images are served at public URLs:
            anyone with a URL can retrieve the image, even before you publish a page. Uploads may
            retain metadata in the original file. Do not upload confidential material or images
            containing information you do not want accessible this way.
          </p>
          <p className="mt-4">
            Your browser stores authentication information, editor drafts, and local application
            data using cookies, local storage, and IndexedDB. Local drafts and cached data may
            remain after sign-out. Clearing browser storage can remove local drafts without
            deleting server content. Removing an image from a page or unpublishing a site does
            not automatically delete uploaded files or previous snapshots.
          </p>
        </section>

        <section aria-labelledby="privacy-providers">
          <h2 id="privacy-providers" className="mb-3 text-lg font-bold">4. Service providers and optional features</h2>
          <p>
            We use Clerk for authentication, Vercel for frontend hosting and performance
            measurements, and Cloudflare for backend services and file storage. These services
            process information needed to deliver their functions. Hosting and performance
            services may process request details, device and browser information, and timing data.
          </p>
          <p className="mt-4">
            When you use optional content features, relevant inputs are sent to the providers
            involved: Google Places for place searches, Mapbox for maps, GitHub for profiles and
            repositories, Figma for file previews, and Apify for Instagram lookups. Link previews fetch
            the URL you submit, including its query parameters. External images and embeds may
            connect your browser directly to their hosts. Retrieved metadata and images may be
            cached or copied into QRK storage.
          </p>
          <p className="mt-4">
            If you request AI content generation, your prompt, current content-block state, and
            render specification are sent to OpenAI to generate a response. Avoid including
            confidential information in those inputs. Each provider also has its own privacy
            terms. We do not sell your personal information or share it for targeted advertising.
          </p>
        </section>

        <section aria-labelledby="privacy-retention">
          <h2 id="privacy-retention" className="mb-3 text-lg font-bold">5. Retention and your choices</h2>
          <p>
            Account information, content, uploads, snapshots, and cached source data can remain
            stored while you use QRK and afterward. QRK does not currently apply a single automatic
            deletion period to all of these records. Deleting your Clerk account does not
            automatically erase QRK content, uploaded files, or publishing history.
          </p>
          <p className="mt-4">
            You can manage your account through Clerk and clear local data through your browser.
            Contact the email above to request access, correction, or deletion of information
            associated with your account. We will verify the request and explain what can be
            removed and what must be retained, including any legal or security requirements.
            Rights available to you depend on applicable law.
          </p>
        </section>

        <section aria-labelledby="privacy-changes">
          <h2 id="privacy-changes" className="mb-3 text-lg font-bold">6. Security and changes</h2>
          <p>
            No online service can guarantee complete security. Protect your sign-in credentials
            and consider the visibility of content before uploading it. If we change this policy,
            we will publish the revised version here with an updated effective date and provide
            any notice required by applicable law.
          </p>
        </section>
      </article>

      <footer className="mt-16 border-t pt-6 text-muted-foreground">
        <UnderlinedLink className="text-[length:inherit]! leading-[inherit]!" href="/terms">Read the terms of service</UnderlinedLink>
      </footer>
    </main>
  );
}
