'use client';

/** In production `error.message` is redacted, so show the digest. */
export default function MatchError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <section className="mt-8 border border-brass bg-surface p-4 corner-step-lg md:p-6">
        <h2 className="type-h2">Something went wrong</h2>
        <p className="mt-2 type-body text-text-muted">This page failed to render.</p>
        {error.digest === undefined ? null : <p className="mt-2 type-table text-text-muted">{error.digest}</p>}
        <button type="button" onClick={retry} className="mt-6 button-brass type-body">
          Try again
        </button>
      </section>
    </main>
  );
}
