export type Section = "dashboard" | "lent" | "borrowed" | "rental" | "calendar" | "notifications" | "archive" | "contacts" | "settings";
export type Theme = "dark" | "light" | "graphite" | "graphite-light";
export type ContactColor = "purple" | "sky" | "pink" | "emerald" | "orange" | "rose" | "amber" | "teal";

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  telegram?: string;
  note?: string;
  avatar: string;
  totalLent: number;
  totalBorrowed: number;
  color: ContactColor;
}

export interface Debt {
  id: number;
  contactId: number;
  name: string;
  amount: number;
  dueDate: string; // пустая строка = бессрочный
  status: "active" | "overdue" | "paid" | "deleted";
  avatar: string;
  note?: string;
  debtDbId?: string;
  shareToken?: string;
  borrowerDecision?: string;
  interestRate?: number;
  interestType?: "simple" | "compound";
  deletedByLender?: boolean;
  deletedByLenderName?: string;
  borrowerDismissed?: boolean;
  pendingPaymentsCount?: number;
  pendingTopUpsCount?: number;
  counterpartyName?: string;
  archivedDir?: "lent" | "borrowed";
  createdAt?: string;
  archivedAt?: string;
  counterpartyAvatarUrl?: string;
}

export interface ChatMeta {
  debtId?: string;
  rentalId?: number;
  chatTitle: string;
  senderName: string;
  lastText: string;
}

export interface SupportMeta {
  ticketId: number;
  subject: string;
  lastText: string;
}

export interface PaymentRequestMeta {
  paymentRequestId: number;
  debtId: string;
  amount: number;
  fromName: string;
  debtTitle: string;
  note?: string | null;
  status: "pending" | "accepted" | "rejected";
}

export interface TopUpRequestMeta {
  topUpRequestId: number;
  debtId: string;
  amount: number;
  fromName: string;
  debtTitle: string;
  note?: string | null;
  status: "pending" | "accepted" | "rejected";
}

export interface Notification {
  id: number;
  type: "warning" | "danger" | "info" | "success";
  title: string;
  message: string;
  date: string;
  read: boolean;
  chatMeta?: ChatMeta;
  supportMeta?: SupportMeta;
  paymentRequestMeta?: PaymentRequestMeta;
  topUpRequestMeta?: TopUpRequestMeta;
  deepUrl?: string;
}

export const COLOR_OPTIONS: { id: ContactColor; label: string; hex: string; bg: string; border: string; text: string }[] = [
  { id: "purple", label: "Фиолетовый", hex: "#a855f7", bg: "rgba(168,85,247,0.25)", border: "rgba(168,85,247,0.5)", text: "#c084fc" },
  { id: "sky",    label: "Голубой",    hex: "#38bdf8", bg: "rgba(56,189,248,0.25)",  border: "rgba(56,189,248,0.5)",  text: "#7dd3fc" },
  { id: "pink",   label: "Розовый",   hex: "#f472b6", bg: "rgba(244,114,182,0.25)", border: "rgba(244,114,182,0.5)", text: "#f9a8d4" },
  { id: "emerald",label: "Зелёный",   hex: "#34d399", bg: "rgba(52,211,153,0.25)",  border: "rgba(52,211,153,0.5)",  text: "#6ee7b7" },
  { id: "orange", label: "Оранжевый", hex: "#fb923c", bg: "rgba(251,146,60,0.25)",  border: "rgba(251,146,60,0.5)",  text: "#fdba74" },
  { id: "rose",   label: "Красный",   hex: "#f43f5e", bg: "rgba(244,63,94,0.25)",   border: "rgba(244,63,94,0.5)",   text: "#fb7185" },
  { id: "amber",  label: "Жёлтый",   hex: "#f59e0b", bg: "rgba(245,158,11,0.25)",  border: "rgba(245,158,11,0.5)",  text: "#fcd34d" },
  { id: "teal",   label: "Бирюзовый", hex: "#14b8a6", bg: "rgba(20,184,166,0.25)",  border: "rgba(20,184,166,0.5)",  text: "#5eead4" },
];

export function getColor(id: ContactColor) {
  return COLOR_OPTIONS.find(c => c.id === id) ?? COLOR_OPTIONS[0];
}

export function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export function calcTotalWithInterest(amount: number, rate: number, type: string, dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return amount;
  const years = days / 365;
  if (type === "compound") return Math.round(amount * Math.pow(1 + rate / 100, years));
  return Math.round(amount * (1 + (rate / 100) * years));
}

export function calcAmountOnDate(
  amount: number,
  rate: number,
  type: string,
  startDate: string,
  targetDate?: string
): number {
  if (!startDate || !rate) return amount;
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const target = targetDate ? new Date(targetDate) : new Date();
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86400000);
  if (days <= 0) return amount;
  const years = days / 365;
  if (type === "compound") return Math.round(amount * Math.pow(1 + rate / 100, years));
  return Math.round(amount * (1 + (rate / 100) * years));
}

export const DEMO_CONTACTS: Contact[] = [
  { id: 1, name: "Алексей Смирнов", phone: "+7 916 123 45 67", email: "alex@example.com", avatar: "АС", totalLent: 15000, totalBorrowed: 0, color: "sky" },
  { id: 2, name: "Мария Козлова", phone: "+7 926 234 56 78", email: "masha@example.com", avatar: "МК", totalLent: 0, totalBorrowed: 8500, color: "pink" },
  { id: 3, name: "Дмитрий Новиков", phone: "+7 903 345 67 89", email: "dima@example.com", avatar: "ДН", totalLent: 32000, totalBorrowed: 0, color: "emerald" },
  { id: 4, name: "Ольга Петрова", phone: "+7 985 456 78 90", email: "olga@example.com", avatar: "ОП", totalLent: 0, totalBorrowed: 5000, color: "orange" },
];

export const DEMO_LENT: Debt[] = [
  { id: 1, contactId: 1, name: "На ремонт машины", amount: 15000, dueDate: "2026-06-01", status: "active", avatar: "АС", note: "Вернёт частями", counterpartyName: "Алексей Смирнов" },
  { id: 2, contactId: 3, name: "Займ до зарплаты", amount: 12000, dueDate: "2026-04-15", status: "overdue", avatar: "ДН", counterpartyName: "Дмитрий Новиков" },
  { id: 3, contactId: 3, name: "На отпуск", amount: 20000, dueDate: "2026-07-10", status: "active", avatar: "ДН", note: "Лето", counterpartyName: "Дмитрий Новиков" },
];

export const DEMO_BORROWED: Debt[] = [
  { id: 4, contactId: 2, name: "За ужин в ресторане", amount: 8500, dueDate: "2026-05-20", status: "active", avatar: "МК", counterpartyName: "Мария Козлова" },
  { id: 5, contactId: 4, name: "Мелкий долг", amount: 5000, dueDate: "2026-05-10", status: "overdue", avatar: "ОП", note: "Срочно", counterpartyName: "Ольга Петрова" },
];

export const DEMO_ARCHIVE: Debt[] = [
  { id: 6, contactId: 1, name: "Прошлый займ", amount: 3000, dueDate: "2025-12-01", status: "paid", avatar: "АС", counterpartyName: "Алексей Смирнов" },
];

export const INIT_CONTACTS: Contact[] = [];