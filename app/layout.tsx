import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Agentic OS",
  description: "Personal Command Center — a Hermes-backed Marketing & Sales operating system."
};

// Auth-gated dashboard with per-request data; render dynamically (matches prior
// behavior and avoids static prerender of client auth pages using useSearchParams).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="font-sans antialiased bg-neutral-950 text-neutral-100">{children}</body>
    </html>
  );
}
