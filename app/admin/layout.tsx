import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — ZIP Code Manager",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {children}
    </div>
  );
}
