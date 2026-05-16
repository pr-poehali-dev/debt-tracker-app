import type { Lang } from "@/i18n";

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US" };

export function fmtDate(d: string | number | Date | null | undefined, lang: Lang, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString(LOCALE[lang], opts ?? { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateShort(d: string | number | Date | null | undefined, lang: Lang): string {
  return fmtDate(d, lang, { day: "numeric", month: "short" });
}

export function monthsShort(lang: Lang): string[] {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { month: "short" });
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(fmt.format(new Date(2024, i, 1)).replace(".", ""));
  }
  return out;
}

export function monthName(year: number, month0: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { month: "long", year: "numeric" }).format(new Date(year, month0, 1));
}
