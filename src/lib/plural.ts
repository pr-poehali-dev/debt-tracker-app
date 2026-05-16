import type { Lang } from "@/i18n";

export function pluralRu(count: number, forms: [string, string, string]): string {
  const n = Math.abs(count) | 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function pluralEn(count: number, forms: [string, string]): string {
  return Math.abs(count) === 1 ? forms[0] : forms[1];
}

export function plural(lang: Lang, count: number, key: keyof typeof PLURAL_FORMS): string {
  const entry = PLURAL_FORMS[key];
  if (lang === "ru") return pluralRu(count, entry.ru);
  return pluralEn(count, entry.en);
}

export const PLURAL_FORMS = {
  activeDebts: {
    ru: ["активный долг", "активных долга", "активных долгов"] as [string, string, string],
    en: ["active debt", "active debts"] as [string, string],
  },
  closedLoans: {
    ru: ["закрытый займ", "закрытых займа", "закрытых займов"] as [string, string, string],
    en: ["completed transaction", "completed transactions"] as [string, string],
  },
  rentals: {
    ru: ["аренда", "аренды", "аренд"] as [string, string, string],
    en: ["rental", "rentals"] as [string, string],
  },
  contacts: {
    ru: ["контакт", "контакта", "контактов"] as [string, string, string],
    en: ["contact", "contacts"] as [string, string],
  },
  overdueItems: {
    ru: ["просроченный", "просроченных", "просроченных"] as [string, string, string],
    en: ["overdue", "overdue"] as [string, string],
  },
  days: {
    ru: ["день", "дня", "дней"] as [string, string, string],
    en: ["day", "days"] as [string, string],
  },
  categories: {
    ru: ["категория", "категории", "категорий"] as [string, string, string],
    en: ["category", "categories"] as [string, string],
  },
  payments: {
    ru: ["платёж", "платежа", "платежей"] as [string, string, string],
    en: ["payment", "payments"] as [string, string],
  },
} as const;

export const PLURALS = {
  activeDebts: PLURAL_FORMS.activeDebts.ru,
  closedLoans: PLURAL_FORMS.closedLoans.ru,
  rentals: PLURAL_FORMS.rentals.ru,
  contacts: PLURAL_FORMS.contacts.ru,
  overdue: PLURAL_FORMS.overdueItems.ru,
  days: PLURAL_FORMS.days.ru,
  categories: PLURAL_FORMS.categories.ru,
  payments: PLURAL_FORMS.payments.ru,
};
