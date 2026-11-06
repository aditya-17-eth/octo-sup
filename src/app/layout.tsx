import type { Metadata } from "next";
import Link from "next/link";
import { Crosshair, ArrowUpRight } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = {
  title: "REALITY.EXE / Physical intelligence",
  description:
    "The physical world, as an API for AI. Human observation. Assessed evidence. Autonomous payment.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="wordmark">
            <Crosshair size={22} /> REALITY<span>.EXE</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/missions">Missions</Link>
            <Link href="/agent">Agent console</Link>
            <Link href="/activity">Activity</Link>
            <Link href="/docs">
              Docs <ArrowUpRight size={12} />
            </Link>
          </nav>
          <div className="network">
            <span className="dot" /> Hedera testnet
          </div>
        </header>
        <main>{children}</main>
        <footer>
          <Link href="/" className="wordmark small">
            REALITY.EXE
          </Link>
          <span>Human observations. Machine-readable intelligence.</span>
          <Link href="/docs">Trust & limitations</Link>
        </footer>
      </body>
    </html>
  );
}
