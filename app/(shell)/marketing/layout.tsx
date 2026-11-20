import { MarketingBackLink } from "@/components/os/marketing-back-link";

// Every Marketing sub-page gets a "← Marketing" button back to the main Marketing page.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingBackLink />
      {children}
    </>
  );
}
