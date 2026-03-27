"use client";

import { useState, useEffect, useRef, useId } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "idle" | "loading" | "success" | "error";

interface Location {
  city: string;
  state: string;
  stateAbbr: string;
}

interface ZippopotamResponse {
  "post code": string;
  places: Array<{
    "place name": string;
    state: string;
    "state abbreviation": string;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 400;
const ZIP_LENGTH = 5;

// ---------------------------------------------------------------------------
// Hook — all fetch/validation logic, zero UI coupling
// ---------------------------------------------------------------------------

function useZipLookup(zip: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [location, setLocation] = useState<Location | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending debounce + in-flight request on every input change
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const digits = zip.replace(/\D/g, "");

    if (digits.length < ZIP_LENGTH) {
      setStatus("idle");
      setLocation(null);
      return;
    }

    setStatus("loading");
    setLocation(null);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `https://api.zippopotam.us/us/${digits}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          setStatus("error");
          return;
        }

        const data: ZippopotamResponse = await res.json();
        const place = data.places?.[0];

        if (!place) {
          setStatus("error");
          return;
        }

        setLocation({
          city: place["place name"],
          state: place["state"],
          stateAbbr: place["state abbreviation"],
        });
        setStatus("success");
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // ignore cancelled requests
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [zip]);

  return { status, location };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { readonly status: Status }) {
  if (status === "loading") {
    return (
      <span
        aria-label="Loading"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
      />
    );
  }

  if (status === "success") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4 text-emerald-500"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4 text-red-500"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return null;
}

function FeedbackLine({
  status,
  location,
}: {
  readonly status: Status;
  readonly location: Location | null;
}) {
  // Reserve space so the layout doesn't shift when the message appears
  const base = "mt-2 flex h-5 items-center gap-1.5 text-sm transition-opacity duration-200";

  if (status === "idle") return <div className={`${base} opacity-0`} aria-hidden="true" />;

  return (
    <div
      className={[
        base,
        status === "loading" ? "text-gray-400" : "",
        status === "success" ? "text-emerald-600" : "",
        status === "error"   ? "text-red-500"    : "",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <StatusIcon status={status} />
      <span>
        {status === "loading" && "Checking…"}
        {status === "success" && location && `${location.city}, ${location.stateAbbr}`}
        {status === "error"   && "Invalid ZIP code"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ZipInputProps {
  /** Called when a valid ZIP is confirmed (status reaches "success"). */
  readonly onConfirm?: (zip: string, location: Location) => void;
  readonly placeholder?: string;
  readonly label?: string;
  readonly className?: string;
}

export default function ZipInput({
  onConfirm,
  placeholder = "e.g. 10001",
  label = "ZIP Code",
  className = "",
}: ZipInputProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const { status, location } = useZipLookup(value);

  // Notify parent once we have a confirmed location
  const confirmedRef = useRef<string | null>(null);
  useEffect(() => {
    if (status === "success" && location && confirmedRef.current !== value) {
      confirmedRef.current = value;
      onConfirm?.(value, location);
    }
    if (status !== "success") confirmedRef.current = null;
  }, [status, location, value, onConfirm]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip non-digits and cap at 5 characters
    const cleaned = e.target.value.replace(/\D/g, "").slice(0, ZIP_LENGTH);
    setValue(cleaned);
  };

  const borderColor =
    status === "success" ? "border-emerald-400 ring-emerald-400/20" :
    status === "error"   ? "border-red-400 ring-red-400/20"         :
    "border-gray-300 ring-blue-400/20";

  return (
    <div className={`w-full max-w-xs ${className}`}>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-gray-700"
      >
        {label}
      </label>

      <div className="relative">
        {/* Map pin icon */}
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={ZIP_LENGTH}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          aria-describedby={`${inputId}-feedback`}
          aria-invalid={status === "error"}
          className={[
            "block w-full rounded-lg border bg-white py-2.5 pl-9 pr-10",
            "text-sm font-mono tracking-widest text-gray-900 placeholder:text-gray-400",
            "outline-none ring-0 transition focus:ring-2",
            borderColor,
          ].join(" ")}
        />

        {/* Right-side status icon inside the input */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <StatusIcon status={status} />
        </div>
      </div>

      {/* Feedback text */}
      <div id={`${inputId}-feedback`}>
        <FeedbackLine status={status} location={location} />
      </div>
    </div>
  );
}
