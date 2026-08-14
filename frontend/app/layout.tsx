import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, IBM_Plex_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EditEase | Promoter analysis and CRISPR guide design for plants",
  description:
    "Open-source platform linking sequence retrieval, gene family characterisation, "
    + "promoter cis-element analysis, sgRNA design and cloning design into one workflow.",
};

// Text-only navigation. The previous version paired every item with a small
// pictogram, which added visual noise without aiding wayfinding once the
// labels are already this short.
const NAV = [
  { href: "/gene-family", label: "Gene family" },
  { href: "/gsds", label: "Structure" },
  { href: "/motif", label: "Motif" },
  { href: "/promoter", label: "Promoter" },
  { href: "/visualize", label: "Maps" },
  { href: "/sgrna", label: "sgRNA" },
  { href: "/cloning", label: "Cloning" },
  { href: "/jobs", label: "Jobs" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen flex flex-col font-sans">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center h-16">
            <Link href="/" className="font-semibold text-lg tracking-tight text-zinc-900">
              EditEase
            </Link>
            <nav className="ml-10 hidden md:flex gap-1">
              {NAV.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-2 rounded-md text-sm text-zinc-600
                             hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex-1">
          {children}
        </main>

        <footer className="border-t border-zinc-200 mt-12 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-500">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-baseline sm:justify-between">
              <span className="font-medium text-zinc-700">EditEase v1.0</span>
              <span>
                Results are computational predictions and require experimental validation.
              </span>
            </div>
            <div className="mt-5 pt-5 border-t border-zinc-100
                            flex flex-col sm:flex-row gap-2 sm:items-baseline sm:justify-between">
              <span>
                © 2026 Katakam Rupini Krishna <span className="italic">et al.</span> All rights reserved.
              </span>
              <span>
                Cite as: Katakam Rupini Krishna <span className="italic">et al.</span>, 2026. EditEase.
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
