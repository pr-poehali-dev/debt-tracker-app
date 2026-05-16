export function pluralRu(count: number, forms: [string, string, string]): string {
  const n = Math.abs(count) | 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export const PLURALS = {
  activeDebts: ["активный долг", "активных долга", "активных долгов"] as [string, string, string],
  closedLoans: ["закрытый займ", "закрытых займа", "закрытых займов"] as [string, string, string],
  rentals: ["аренда", "аренды", "аренд"] as [string, string, string],
  contacts: ["контакт", "контакта", "контактов"] as [string, string, string],
  overdue: ["просроченный", "просроченных", "просроченных"] as [string, string, string],
  days: ["день", "дня", "дней"] as [string, string, string],
  categories: ["категория", "категории", "категорий"] as [string, string, string],
  payments: ["платёж", "платежа", "платежей"] as [string, string, string],
};
