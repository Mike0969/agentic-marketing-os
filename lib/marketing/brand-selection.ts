/**
 * The brand the whole app works on. Order: the header switcher's choice (cookie, remembered a year) →
 * Settings → Default brand (brands.is_default) → a brand named Gulf-EL… → the first brand.
 * getDashboardData() puts it first in data.brands, so every page and picker that starts with the first
 * brand starts with this one.
 */
export const BRAND_COOKIE = "mos_brand";

type B = { id: string; name: string; is_default?: boolean | null };

/** Pure: the selected brand id. */
export function pickSelectedBrandId<T extends B>(brands: T[], cookieId?: string | null): string | null {
  if (cookieId && brands.some((b) => b.id === cookieId)) return cookieId;
  return (brands.find((b) => b.is_default) ?? brands.find((b) => /^gulf-el/i.test(b.name)) ?? brands[0])?.id ?? null;
}

/** Pure: the selected brand first, the rest in their order. */
export function orderBySelection<T extends B>(brands: T[], selectedId: string | null): T[] {
  const sel = brands.find((b) => b.id === selectedId);
  return sel ? [sel, ...brands.filter((b) => b !== sel)] : brands;
}

/** The cookie value in the current request, or null outside a request. */
export async function selectedBrandCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(BRAND_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** For the header switcher: the brands (id, name) in display order and the selected one. Never throws. */
export async function getBrandChoices(): Promise<{ brands: Array<{ id: string; name: string }>; selectedId: string | null }> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    if (!supabase) return { brands: [], selectedId: null };
    const { data } = await supabase.from("brands").select("id,name,is_default").order("name");
    const rows = (data ?? []) as B[];
    const selectedId = pickSelectedBrandId(rows, await selectedBrandCookie());
    return { brands: orderBySelection(rows, selectedId).map(({ id, name }) => ({ id, name })), selectedId };
  } catch {
    return { brands: [], selectedId: null };
  }
}
