/* oxlint-disable next/no-html-link-for-pages -- Home belongs to the separate web zone and requires a document navigation. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Page not found</h1>
        <p className="mt-3 text-lg text-gray-600">The page you’re looking for doesn’t exist.</p>
        <div className="mt-6">
          <a
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
