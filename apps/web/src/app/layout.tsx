import type { Metadata } from 'next';
import Link from 'next/link';
import { fontVariables } from '@/styles/fonts.gen';
import './globals.css';

export const metadata: Metadata = {
  title: { default: "Patron's Almanac", template: "%s | Patron's Almanac" },
  description: 'Deadlock player records, set in ledger columns.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-theme="dusk" className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <header className="border-b border-hairline">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-4 md:px-6">
            <Link href="/" className="type-display-l text-gilt">
              Patron&apos;s Almanac
            </Link>
            <nav aria-label="Main">
              <Link href="/leaderboard" className="type-body hover:text-gilt">
                Leaderboard
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-hairline">
          <p className="mx-auto max-w-5xl px-4 py-6 type-body-small text-text-muted md:px-6">
            Data from deadlock-api.com. Not affiliated with Valve.
          </p>
        </footer>
      </body>
    </html>
  );
}
