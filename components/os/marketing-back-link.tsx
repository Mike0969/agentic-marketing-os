"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function MarketingBackLink() {
  const pathname = usePathname();
  if (pathname === "/marketing") return null;
  return (
    <Link
      href="/marketing"
      className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
    >
      <ArrowLeft className="h-4 w-4" />
      Marketing
    </Link>
  );
}
