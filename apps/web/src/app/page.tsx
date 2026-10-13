import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-12 pb-8 md:px-6">
      <h1 className="type-display-xl text-gilt">Patron&apos;s Almanac</h1>
      <p className="mt-4 type-body">Deadlock match records from deadlock-api.com, set in ledger columns.</p>
      <Link href="/player/256939921" className="mt-6 button-brass type-body">
        View the demo profile
      </Link>
    </main>
  );
}
