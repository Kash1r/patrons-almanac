import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <h1 className="type-h1 text-gilt">No such page</h1>
      <p className="mt-4 type-body">Account ids are the number in a Steam profile&apos;s friend code.</p>
      <Link href="/" className="mt-6 button-brass type-body">
        Back to the almanac
      </Link>
    </main>
  );
}
