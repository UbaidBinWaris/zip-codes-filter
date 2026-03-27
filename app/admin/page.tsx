"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ZipMatchRow {
  id?: number;
  group: string;
  label: string;
}

interface ZipRecord {
  id: number;
  zip: string;
  city: string | null;
  state: string | null;
  matches: ZipMatchRow[];
}

interface PaginatedResponse {
  data: ZipRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface FormState {
  zip: string;
  city: string;
  state: string;
  matches: ZipMatchRow[];
}

type ModalMode = "add" | "edit" | null;

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

const EMPTY_FORM: FormState = { zip: "", city: "", state: "", matches: [] };

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium",
            t.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white",
          ].join(" ")}
        >
          {t.type === "success" ? (
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )}
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-auto pl-2 opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  zip,
  onConfirm,
  onCancel,
  loading,
}: {
  zip: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-gray-900">Delete ZIP {zip}?</h2>
        <p className="mt-1 text-sm text-gray-500">
          This will permanently remove the ZIP and all its matches. This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ZIP form modal (add + edit)
// ---------------------------------------------------------------------------

const KNOWN_GROUPS = [
  "D1 Solar LT",
  "D1 LT CPL",
  "D2 LT",
  "Home CPA Transfer",
  "D5",
  "B3 LG",
];

function ZipFormModal({
  mode,
  form,
  saving,
  onChange,
  onAddMatch,
  onRemoveMatch,
  onUpdateMatch,
  onSubmit,
  onClose,
}: {
  mode: "add" | "edit";
  form: FormState;
  saving: boolean;
  onChange: (field: keyof Omit<FormState, "matches">, value: string) => void;
  onAddMatch: () => void;
  onRemoveMatch: (i: number) => void;
  onUpdateMatch: (i: number, field: "group" | "label", value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === "add" ? "Add ZIP Code" : "Edit ZIP Code"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* ZIP */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">ZIP Code <span className="text-red-500">*</span></label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={10}
              value={form.zip}
              onChange={(e) => onChange("zip", e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 41001"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* City + State */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => onChange("city", e.target.value)}
                placeholder="e.g. Alexandria"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">State</label>
              <input
                type="text"
                maxLength={2}
                value={form.state}
                onChange={(e) => onChange("state", e.target.value.toUpperCase())}
                placeholder="e.g. KY"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Matches */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Matches</label>
              <button
                type="button"
                onClick={onAddMatch}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add match
              </button>
            </div>

            {form.matches.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
                No matches yet — click &ldquo;Add match&rdquo;
              </p>
            ) : (
              <div className="space-y-2">
                {form.matches.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={m.group}
                      onChange={(e) => onUpdateMatch(i, "group", e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Group…</option>
                      {KNOWN_GROUPS.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Label"
                      value={m.label}
                      onChange={(e) => onUpdateMatch(i, "label", e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveMatch(i)}
                      className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={saving || !form.zip}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {mode === "add" ? "Create ZIP" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const router = useRouter();

  // Data state
  const [records,    setRecords]    = useState<ZipRecord[]>([]);
  const [total,      setTotal]      = useState(0);
  const [pages,      setPages]      = useState(1);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState("");
  const [loading,    setLoading]    = useState(true);

  // Modal / dialog state
  const [modal,      setModal]      = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<ZipRecord | null>(null);
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ZipRecord | null>(null);
  const [deleting,   setDeleting]   = useState(false);

  // Toasts
  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // ── Toast helpers ─────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: "success" | "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Fetch data ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:   String(pg),
        limit:  String(PAGE_SIZE),
        search: q,
      });
      const res = await fetch(`/api/zips?${params}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) throw new Error("Failed to load data");
      const json: PaginatedResponse = await res.json();
      setRecords(json.data);
      setTotal(json.total);
      setPages(json.pages);
      setPage(json.page);
    } catch (err) {
      showToast("Failed to load ZIP records.", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(1, search), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchData]);

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  // ── Add ───────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setModal("add");
  };

  // ── Edit ──────────────────────────────────────────────────────────────────

  const openEdit = (record: ZipRecord) => {
    setEditTarget(record);
    setForm({
      zip:     record.zip,
      city:    record.city    ?? "",
      state:   record.state   ?? "",
      matches: record.matches.map(({ group, label }) => ({ group, label })),
    });
    setModal("edit");
  };

  // ── Form helpers ──────────────────────────────────────────────────────────

  const handleFormChange = (field: keyof Omit<FormState, "matches">, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddMatch = () => {
    setForm((prev) => ({ ...prev, matches: [...prev.matches, { group: "", label: "" }] }));
  };

  const handleRemoveMatch = (i: number) => {
    setForm((prev) => ({ ...prev, matches: prev.matches.filter((_, idx) => idx !== i) }));
  };

  const handleUpdateMatch = (i: number, field: "group" | "label", value: string) => {
    setForm((prev) => {
      const matches = [...prev.matches];
      matches[i] = { ...matches[i], [field]: value };
      return { ...prev, matches };
    });
  };

  // ── Submit (add or edit) ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.zip) return;
    setSaving(true);

    const payload = {
      zip:     form.zip,
      city:    form.city  || null,
      state:   form.state || null,
      matches: form.matches.filter((m) => m.group && m.label),
    };

    try {
      let res: Response;
      if (modal === "add") {
        res = await fetch("/api/zips", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/zips/${editTarget!.id}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? "Save failed.", "error");
        return;
      }

      showToast(
        modal === "add" ? `ZIP ${form.zip} created.` : `ZIP ${form.zip} updated.`,
        "success"
      );
      setModal(null);
      fetchData(page, search);
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/zips/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error ?? "Delete failed.", "error");
        return;
      }
      showToast(`ZIP ${deleteTarget.zip} deleted.`, "success");
      setDeleteTarget(null);
      // If we deleted the only record on this page, go back one
      const newPage = records.length === 1 && page > 1 ? page - 1 : page;
      fetchData(newPage, search);
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-gray-900">ZIP Admin</span>
              <span className="ml-2 text-xs text-gray-400">{total.toLocaleString()} records</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              ← Search
            </a>
            <button
              onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">

        {/* Search + Add */}
        <div className="mb-5 flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search by ZIP, city, or state…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add ZIP
          </button>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ZIP</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">City</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Matches</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-gray-100" style={{ width: j === 4 ? 80 : "70%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-sm text-gray-400">
                      {search ? `No results for "${search}"` : "No ZIP records yet."}
                    </td>
                  </tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">{r.zip}</td>
                      <td className="px-4 py-3 text-gray-600">{r.city ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.state ? (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {r.state}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          {r.matches.length} match{r.matches.length !== 1 ? "es" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteTarget(r)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <span className="text-xs text-gray-400">
                Page {page} of {pages} · {total.toLocaleString()} total
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchData(page - 1, search)}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => fetchData(page + 1, search)}
                  disabled={page >= pages || loading}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modals ── */}
      {modal && (
        <ZipFormModal
          mode={modal}
          form={form}
          saving={saving}
          onChange={handleFormChange}
          onAddMatch={handleAddMatch}
          onRemoveMatch={handleRemoveMatch}
          onUpdateMatch={handleUpdateMatch}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          zip={deleteTarget.zip}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {/* ── Toasts ── */}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
