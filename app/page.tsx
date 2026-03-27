import path from "path";
import fs from "fs";
import { parseCSV } from "@/lib/parseCSV";
import { buildIndex } from "@/lib/search";
import ZipSearch from "@/components/ZipSearch";

/**
 * Server Component — reads and parses the CSV once at request time,
 * builds the search index, then passes it to the client ZipSearch component.
 *
 * Swap `readCsvFromDisk` with an API/DB call here when you migrate away from CSV.
 */
export default async function HomePage() {
  // ── Load & parse data (server-side only) ──────────────────────────────────
  const csvPath = path.join(process.cwd(), "data.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csvContent);
  const index = buildIndex(rows);

  // The index (with Maps) must be serialised to plain objects before crossing
  // the server→client boundary via props. Maps are already plain objects in
  // our SearchIndex type, so no extra work needed.

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <svg
                  className="h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <span className="text-base font-semibold text-gray-900">ZIP Code Search</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{rows.length.toLocaleString()} rows</span>
              <span>·</span>
              <span>{Object.keys(index.exactMap).length.toLocaleString()} unique ZIPs</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Hero text */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            ZIP Code Lookup
          </h1>
          <p className="mt-2 text-base text-gray-500">
            Search across Transfer Buyers and LG Buyers categories.
            Exact matches are ranked first; partial / substring matches follow.
          </p>
        </div>

        {/* Search + results (client interactive island) */}
        <ZipSearch index={index} />
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="mt-20 border-t border-gray-100 py-6 text-center text-xs text-gray-300">
        Data sourced from local CSV · future-ready for API/DB migration
      </footer>
    </div>
  );
}
