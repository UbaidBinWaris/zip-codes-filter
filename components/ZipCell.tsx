"use client";

/**
 * Renders a ZIP code value, optionally highlighting the matched substring.
 */
interface Props {
  zip: string;
  query: string;
  isMatched: boolean;
}

export default function ZipCell({ zip, query, isMatched }: Props) {
  if (!zip) {
    return <span className="text-gray-300">—</span>;
  }

  if (!isMatched || !query) {
    return <span className="font-mono text-sm text-gray-700">{zip}</span>;
  }

  // Highlight the matched substring
  const idx = zip.indexOf(query);
  if (idx === -1) {
    // Exact match: whole zip equals query
    return (
      <mark className="rounded bg-yellow-200 px-0.5 font-mono text-sm font-semibold text-yellow-900">
        {zip}
      </mark>
    );
  }

  const before = zip.slice(0, idx);
  const matched = zip.slice(idx, idx + query.length);
  const after = zip.slice(idx + query.length);

  return (
    <span className="font-mono text-sm">
      <span className="text-gray-700">{before}</span>
      <mark className="rounded bg-yellow-200 px-0.5 font-semibold text-yellow-900">
        {matched}
      </mark>
      <span className="text-gray-700">{after}</span>
    </span>
  );
}
