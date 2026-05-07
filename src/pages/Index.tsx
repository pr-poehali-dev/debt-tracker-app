import { useState } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────
type Section = "dashboard" | "lent" | "borrowed" | "calendar" | "notifications" | "archive" | "contacts";

type ContactColor = "purple" | "sky" | "pink" | "emerald" | "orange" | "rose" | "amber" | "teal";

interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  totalLent: number;
  totalBorrowed: number;
  color: ContactColor;
}

interface Debt {
  id: number;
  contactId: number;
  name: string;
  amount: number;
  dueDate: string;
  status: "active" | "overdue" | "paid";
  avatar: string;
  note?: string;
}

interface Notification {
  id: number;
  type: "warning" | "danger" | "info" | "success";
  title: string;
  message: string;
  date: string;
  read: boolean;
}

// ─── Color palette ────────────────────────────────────────────────────────────
const COLOR_OPTIONS: { id: ContactColor; label: string; hex: string; bg: string; border: string; text: string }[] = [
  { id: "purple", label: "Фиолетовый", hex: "#a855f7", bg: "rgba(168,85,247,0.25)", border: "rgba(168,85,247,0.5)", text: "#c084fc" },
  { id: "sky",    label: "Голубой",    hex: "#38bdf8", bg: "rgba(56,189,248,0.25)",  border: "rgba(56,189,248,0.5)",  text: "#7dd3fc" },
  { id: "pink",   label: "Розовый",   hex: "#f472b6", bg: "rgba(244,114,182,0.25)", border: "rgba(244,114,182,0.5)", text: "#f9a8d4" },
  { id: "emerald",label: "Зелёный",   hex: "#34d399", bg: "rgba(52,211,153,0.25)",  border: "rgba(52,211,153,0.5)",  text: "#6ee7b7" },
  { id: "orange", label: "Оранжевый", hex: "#fb923c", bg: "rgba(251,146,60,0.25)",  border: "rgba(251,146,60,0.5)",  text: "#fdba74" },
  { id: "rose",   label: "Красный",   hex: "#f43f5e", bg: "rgba(244,63,94,0.25)",   border: "rgba(244,63,94,0.5)",   text: "#fb7185" },
  { id: "amber",  label: "Жёлтый",   hex: "#f59e0b", bg: "rgba(245,158,11,0.25)",  border: "rgba(245,158,11,0.5)",  text: "#fcd34d" },
  { id: "teal",   label: "Бирюзовый", hex: "#14b8a6", bg: "rgba(20,184,166,0.25)",  border: "rgba(20,184,166,0.5)",  text: "#5eead4" },
];

function getColor(id: ContactColor) {
  return COLOR_OPTIONS.find(c => c.id === id) ?? COLOR_OPTIONS[0];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const INIT_CONTACTS: Contact[] = [
  { id: 1, name: "Алексей Смирнов",  phone: "+7 (999) 123-45-67", email: "alex@mail.ru",    avatar: "АС", totalLent: 25000, totalBorrowed: 0,     color: "purple"  },
  { id: 2, name: "Мария Козлова",    phone: "+7 (999) 234-56-78", email: "maria@gmail.com",  avatar: "МК", totalLent: 8500,  totalBorrowed: 0,     color: "pink"    },
  { id: 3, name: "Николай Федоров",  phone: "+7 (999) 345-67-89", email: "nick@yandex.ru",   avatar: "НФ", totalLent: 0,     totalBorrowed: 12000, color: "sky"     },
  { id: 4, name: "Анна Морозова",    phone: "+7 (999) 456-78-90", email: "anna@mail.ru",     avatar: "АМ", totalLent: 0,     totalBorrowed: 30000, color: "emerald" },
  { id: 5, name: "Дмитрий Иванов",  phone: "+7 (999) 567-89-01", email: "dmitry@gmail.com", avatar: "ДИ", totalLent: 50000, totalBorrowed: 0,     color: "orange"  },
  { id: 6, name: "Елена Петрова",   phone: "+7 (999) 678-90-12", email: "elena@mail.ru",    avatar: "ЕП", totalLent: 3200,  totalBorrowed: 0,     color: "rose"    },
  { id: 7, name: "Павел Чернов",    phone: "+7 (999) 789-01-23", email: "pavel@gmail.com",  avatar: "ПЧ", totalLent: 0,     totalBorrowed: 5000,  color: "amber"   },
  { id: 8, name: "Сергей Волков",   phone: "+7 (999) 890-12-34", email: "sergey@mail.ru",   avatar: "СВ", totalLent: 15000, totalBorrowed: 0,     color: "teal"    },
];

const lentDebts: Debt[] = [
  { id: 1, contactId: 1, name: "Алексей Смирнов", amount: 25000, dueDate: "2026-05-15", status: "active",  avatar: "АС", note: "Займ на ремонт" },
  { id: 2, contactId: 2, name: "Мария Козлова",   amount: 8500,  dueDate: "2026-05-10", status: "overdue", avatar: "МК", note: "До зарплаты" },
  { id: 3, contactId: 5, name: "Дмитрий Иванов",  amount: 50000, dueDate: "2026-06-01", status: "active",  avatar: "ДИ", note: "Бизнес-кредит" },
  { id: 4, contactId: 6, name: "Елена Петрова",   amount: 3200,  dueDate: "2026-04-30", status: "overdue", avatar: "ЕП" },
  { id: 5, contactId: 8, name: "Сергей Волков",   amount: 15000, dueDate: "2026-07-15", status: "active",  avatar: "СВ", note: "Покупка ноутбука" },
];

const borrowedDebts: Debt[] = [
  { id: 6, contactId: 3, name: "Николай Федоров", amount: 12000, dueDate: "2026-05-20", status: "active",  avatar: "НФ", note: "Отдать в мае" },
  { id: 7, contactId: 4, name: "Анна Морозова",   amount: 30000, dueDate: "2026-06-15", status: "active",  avatar: "АМ", note: "Помогла с переездом" },
  { id: 8, contactId: 7, name: "Павел Чернов",    amount: 5000,  dueDate: "2026-05-08", status: "overdue", avatar: "ПЧ" },
];

const calendarEvents = [
  { day: 8,  month: "Май",  contactId: 7, name: "Павел Чернов",    amount: 5000,  dir: "pay"     },
  { day: 10, month: "Май",  contactId: 2, name: "Мария Козлова",   amount: 8500,  dir: "receive" },
  { day: 15, month: "Май",  contactId: 1, name: "Алексей Смирнов", amount: 25000, dir: "receive" },
  { day: 20, month: "Май",  contactId: 3, name: "Николай Федоров", amount: 12000, dir: "pay"     },
  { day: 1,  month: "Июнь", contactId: 5, name: "Дмитрий Иванов",  amount: 50000, dir: "receive" },
  { day: 15, month: "Июнь", contactId: 4, name: "Анна Морозова",   amount: 30000, dir: "pay"     },
];

const notifications: Notification[] = [
  { id: 1, type: "danger",  title: "Просрочен платёж", message: "Мария Козлова должна вернуть 8 500 ₽ — срок истёк 10 мая",        date: "Сегодня",  read: false },
  { id: 2, type: "danger",  title: "Просрочен платёж", message: "Елена Петрова должна вернуть 3 200 ₽ — срок истёк 30 апреля",     date: "Сегодня",  read: false },
  { id: 3, type: "warning", title: "Скоро платёж",     message: "Нужно отдать Павлу Чернову 5 000 ₽ — срок 8 мая",                 date: "Вчера",    read: false },
  { id: 4, type: "warning", title: "Через 8 дней",     message: "Алексей Смирнов должен вернуть 25 000 ₽ — срок 15 мая",           date: "2 мая",    read: true  },
  { id: 5, type: "info",    title: "Напоминание",       message: "Не забудьте вернуть 12 000 ₽ Николаю Федорову до 20 мая",        date: "1 мая",    read: true  },
  { id: 6, type: "success", title: "Долг погашен",      message: "Сергей Волков погасил долг 20 000 ₽",                             date: "28 апреля",read: true  },
];

const archiveDebts: Debt[] = [
  { id: 10, contactId: 8, name: "Сергей Волков",  amount: 20000, dueDate: "2026-04-28", status: "paid", avatar: "СВ", note: "Возвращено в срок" },
  { id: 11, contactId: 3, name: "Ирина Белова",   amount: 7000,  dueDate: "2026-04-15", status: "paid", avatar: "ИБ" },
  { id: 12, contactId: 5, name: "Олег Тихонов",   amount: 45000, dueDate: "2026-03-30", status: "paid", avatar: "ОТ", note: "Бизнес-займ" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function useContactColor(contacts: Contact[], contactId: number) {
  const contact = contacts.find(c => c.id === contactId);
  return contact ? getColor(contact.color) : getColor("purple");
}

// ─── Color Picker ─────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: ContactColor; onChange: (c: ContactColor) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {COLOR_OPTIONS.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          title={c.label}
          className="w-7 h-7 rounded-full transition-all duration-150 flex items-center justify-center"
          style={{
            background: c.hex,
            boxShadow: value === c.id ? `0 0 0 2px #0d0f1a, 0 0 0 4px ${c.hex}` : "none",
            transform: value === c.id ? "scale(1.2)" : "scale(1)",
          }}
        >
          {value === c.id && <Icon name="Check" size={12} className="text-white" />}
        </button>
      ))}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ initials, color, size = "md" }: { initials: string; color?: ContactColor; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" };
  const c = color ? getColor(color) : null;

  if (c) {
    return (
      <div
        className={`${sizes[size]} rounded-2xl flex items-center justify-center font-bold text-white flex-shrink-0`}
        style={{ background: `linear-gradient(135deg, ${c.hex}, ${c.hex}99)`, boxShadow: `0 0 12px ${c.hex}55` }}
      >
        {initials}
      </div>
    );
  }

  const gradients = ["from-purple-500 to-indigo-500","from-sky-500 to-blue-600","from-pink-500 to-purple-500","from-emerald-500 to-teal-500","from-orange-500 to-amber-500"];
  const idx = initials.charCodeAt(0) % gradients.length;
  return (
    <div className={`${sizes[size]} rounded-2xl bg-gradient-to-br ${gradients[idx]} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: Debt["status"] }) {
  const map = {
    active:  { label: "Активен",   cls: "bg-blue-500/15 text-blue-400 border border-blue-500/20"  },
    overdue: { label: "Просрочен", cls: "bg-red-500/15 text-red-400 border border-red-500/20"     },
    paid:    { label: "Погашен",   cls: "bg-green-500/15 text-green-400 border border-green-500/20"},
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}

function NotifIcon({ type }: { type: Notification["type"] }) {
  const map: Record<Notification["type"], { icon: string; cls: string }> = {
    danger:  { icon: "AlertCircle",  cls: "text-red-400 bg-red-500/15"   },
    warning: { icon: "Clock",        cls: "text-amber-400 bg-amber-500/15"},
    info:    { icon: "Bell",         cls: "text-blue-400 bg-blue-500/15" },
    success: { icon: "CheckCircle2", cls: "text-green-400 bg-green-500/15"},
  };
  const m = map[type];
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.cls}`}>
      <Icon name={m.icon} size={18} />
    </div>
  );
}

// ─── Section: Debts ───────────────────────────────────────────────────────────
function DebtList({ debts, dir, contacts }: { debts: Debt[]; dir: "lent" | "borrowed"; contacts: Contact[] }) {
  const total = debts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const overdue = debts.filter(d => d.status === "overdue").length;

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className={`glass rounded-2xl p-4 col-span-3 sm:col-span-1 ${dir === "lent" ? "glow-purple" : "glow-blue"}`}>
          <p className="text-muted-foreground text-xs mb-1">{dir === "lent" ? "Всего выдано" : "Всего взято"}</p>
          <p className={`text-2xl font-bold font-heading ${dir === "lent" ? "text-gradient-purple" : "text-gradient-blue"}`}>{fmt(total)}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-muted-foreground text-xs mb-1">Активных</p>
          <p className="text-2xl font-bold font-heading text-foreground">{debts.filter(d => d.status === "active").length}</p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-muted-foreground text-xs mb-1">Просрочено</p>
          <p className="text-2xl font-bold font-heading text-red-400">{overdue}</p>
        </div>
      </div>

      <div className="space-y-3">
        {debts.map((d, i) => {
          const contact = contacts.find(c => c.id === d.contactId);
          const col = contact ? getColor(contact.color) : null;
          return (
            <div
              key={d.id}
              className="glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer group"
              style={{ animationDelay: `${i * 0.05}s`, borderLeft: col ? `3px solid ${col.hex}` : undefined }}
            >
              <Avatar initials={d.avatar} color={contact?.color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-semibold text-foreground truncate">{d.name}</span>
                  <StatusBadge status={d.status} />
                </div>
                {d.note && <p className="text-xs text-muted-foreground truncate">{d.note}</p>}
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Icon name="Calendar" size={11} />
                  {new Date(d.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold font-heading" style={{ color: d.status === "overdue" ? "#f87171" : col ? col.text : dir === "lent" ? "#c084fc" : "#7dd3fc" }}>
                  {fmt(d.amount)}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>

      <button className={`mt-4 w-full py-3 rounded-2xl glass border border-dashed ${dir === "lent" ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10"} transition-all duration-200 font-medium flex items-center justify-center gap-2`}>
        <Icon name="Plus" size={16} />
        {dir === "lent" ? "Добавить выданный займ" : "Добавить взятый займ"}
      </button>
    </div>
  );
}

// ─── Section: Calendar ────────────────────────────────────────────────────────
function CalendarSection({ contacts }: { contacts: Contact[] }) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const today = 7;
  const mayEvents = calendarEvents.filter(e => e.month === "Май");

  // Map day -> colors (multiple contacts per day)
  const dayColors: Record<number, string[]> = {};
  mayEvents.forEach(ev => {
    const contact = contacts.find(c => c.id === ev.contactId);
    const hex = contact ? getColor(contact.color).hex : "#a855f7";
    if (!dayColors[ev.day]) dayColors[ev.day] = [];
    dayColors[ev.day].push(hex);
  });

  return (
    <div className="animate-fade-in">
      <div className="glass rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-lg">Май 2026</h3>
          <div className="flex gap-2">
            <button className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
              <Icon name="ChevronLeft" size={16} />
            </button>
            <button className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
              <Icon name="ChevronRight" size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(d => (
            <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 4 }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(d => {
            const isToday = d === today;
            const colors = dayColors[d] ?? [];
            const hasEvent = colors.length > 0;
            return (
              <div
                key={d}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium cursor-pointer transition-all duration-200 relative
                  ${isToday ? "gradient-purple text-white glow-purple font-bold" : "hover:bg-white/10"}
                  ${hasEvent && !isToday ? "bg-white/5" : ""}
                `}
                style={hasEvent && !isToday ? { border: `1px solid ${colors[0]}55` } : undefined}
              >
                {d}
                {/* Color dots — up to 3 */}
                {hasEvent && !isToday && (
                  <div className="flex gap-0.5 absolute bottom-1">
                    {colors.slice(0, 3).map((hex, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: hex }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="glass rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3">
        {calendarEvents.map((ev, i) => {
          const contact = contacts.find(c => c.id === ev.contactId);
          const col = contact ? getColor(contact.color) : getColor("purple");
          return (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.hex }} />
              <span className="text-xs text-muted-foreground">{ev.name.split(" ")[0]}</span>
            </div>
          );
        })}
      </div>

      <h3 className="font-heading font-semibold mb-3 text-muted-foreground text-sm uppercase tracking-wider">Предстоящие платежи</h3>
      <div className="space-y-3">
        {calendarEvents.map((ev, i) => {
          const contact = contacts.find(c => c.id === ev.contactId);
          const col = contact ? getColor(contact.color) : getColor("purple");
          return (
            <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3" style={{ borderLeft: `3px solid ${col.hex}` }}>
              <div
                className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: col.bg, border: `1px solid ${col.border}` }}
              >
                <span className="text-base font-bold text-foreground leading-none">{ev.day}</span>
                <span className="text-[9px] text-muted-foreground">{ev.month}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.hex }} />
                  <p className="font-medium text-foreground">{ev.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{ev.dir === "receive" ? "Получить от должника" : "Вернуть кредитору"}</p>
              </div>
              <div className="font-bold font-heading text-base flex-shrink-0" style={{ color: col.text }}>
                {ev.dir === "receive" ? "+" : "−"}{fmt(ev.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────
function NotificationsSection() {
  const [notifs, setNotifs] = useState(notifications);
  const unread = notifs.filter(n => !n.read).length;

  return (
    <div className="animate-fade-in">
      {unread > 0 && (
        <div className="glass rounded-2xl p-4 mb-5 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon name="AlertTriangle" size={20} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-400">{unread} непрочитанных уведомления</p>
              <p className="text-xs text-muted-foreground">Требуют вашего внимания</p>
            </div>
            <button onClick={() => setNotifs(notifs.map(n => ({ ...n, read: true })))} className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              Прочитать все
            </button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {notifs.map((n, i) => (
          <div key={n.id} className={`glass rounded-2xl p-4 flex items-start gap-3 transition-all duration-200 hover:bg-white/[0.06] ${!n.read ? "border border-white/10" : "opacity-60"}`} style={{ animationDelay: `${i * 0.04}s` }}>
            <NotifIcon type={n.type} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-semibold text-sm text-foreground">{n.title}</p>
                {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">{n.date}</p>
            </div>
          </div>
        ))}
      </div>
      <button className="mt-4 w-full py-3 rounded-2xl glass border border-dashed border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all duration-200 font-medium flex items-center justify-center gap-2">
        <Icon name="Settings" size={16} />
        Настроить уведомления
      </button>
    </div>
  );
}

// ─── Section: Archive ─────────────────────────────────────────────────────────
function ArchiveSection({ contacts }: { contacts: Contact[] }) {
  const total = archiveDebts.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="animate-fade-in">
      <div className="glass rounded-2xl p-4 mb-5 bg-green-500/5 border border-green-500/15">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon name="CheckCircle2" size={20} className="text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-green-400">Погашено на {fmt(total)}</p>
            <p className="text-xs text-muted-foreground">{archiveDebts.length} завершённых транзакций</p>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {archiveDebts.map((d, i) => {
          const contact = contacts.find(c => c.id === d.contactId);
          return (
            <div key={d.id} className="glass rounded-2xl p-4 flex items-center gap-4 opacity-80 hover:opacity-100 transition-opacity" style={{ animationDelay: `${i * 0.05}s` }}>
              <Avatar initials={d.avatar} color={contact?.color} />
              <div className="flex-1">
                <p className="font-semibold text-foreground">{d.name}</p>
                {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(d.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold font-heading text-green-400">{fmt(d.amount)}</p>
                <StatusBadge status="paid" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Contacts ────────────────────────────────────────────────────────
function ContactsSection({ contacts, onColorChange }: { contacts: Contact[]; onColorChange: (id: number, color: ContactColor) => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="animate-fade-in">
      <div className="space-y-3">
        {contacts.map((c, i) => {
          const col = getColor(c.color);
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className="glass rounded-2xl p-4 transition-all duration-200"
              style={{ animationDelay: `${i * 0.05}s`, borderLeft: `3px solid ${col.hex}` }}
            >
              <div className="flex items-center gap-4 mb-3">
                <Avatar initials={c.avatar} color={c.color} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Icon name="Phone" size={11} />{c.phone}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Icon name="Mail" size={11} />{c.email}
                  </p>
                </div>
                <button
                  onClick={() => setEditingId(isEditing ? null : c.id)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{ color: col.text }}
                  title="Выбрать цвет"
                >
                  <div className="w-4 h-4 rounded-full" style={{ background: col.hex, boxShadow: `0 0 6px ${col.hex}` }} />
                </button>
              </div>

              {isEditing && (
                <div className="mb-3 p-3 rounded-xl" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                  <p className="text-xs mb-2" style={{ color: col.text }}>Цвет контакта в календаре:</p>
                  <ColorPicker value={c.color} onChange={(newColor) => onColorChange(c.id, newColor)} />
                </div>
              )}

              <div className="flex gap-2">
                {c.totalLent > 0 && (
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                    <p className="text-[10px] mb-0.5" style={{ color: col.text + "aa" }}>Должен вам</p>
                    <p className="font-bold text-sm" style={{ color: col.text }}>{fmt(c.totalLent)}</p>
                  </div>
                )}
                {c.totalBorrowed > 0 && (
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                    <p className="text-[10px] mb-0.5" style={{ color: col.text + "aa" }}>Вы должны</p>
                    <p className="font-bold text-sm" style={{ color: col.text }}>{fmt(c.totalBorrowed)}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="mt-4 w-full py-3 rounded-2xl glass border border-dashed border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all duration-200 font-medium flex items-center justify-center gap-2">
        <Icon name="UserPlus" size={16} />
        Добавить контакт
      </button>
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────
function Dashboard({ onNav, contacts }: { onNav: (s: Section) => void; contacts: Contact[] }) {
  const totalLent = lentDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const totalBorrowed = borrowedDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const balance = totalLent - totalBorrowed;
  const overdueCount = [...lentDebts, ...borrowedDebts].filter(d => d.status === "overdue").length;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="relative rounded-3xl overflow-hidden p-6" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(99,102,241,0.2) 50%, rgba(56,189,248,0.2) 100%)", border: "1px solid rgba(168,85,247,0.3)" }}>
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 50%, rgba(168,85,247,0.5), transparent 60%)" }} />
        <div className="relative">
          <p className="text-muted-foreground text-sm mb-1">Чистый баланс</p>
          <p className={`text-4xl font-black font-heading mb-1 ${balance >= 0 ? "text-gradient-purple" : "text-red-400"}`}>
            {balance >= 0 ? "+" : ""}{fmt(balance)}
          </p>
          <p className="text-xs text-muted-foreground">{balance >= 0 ? "Вам должны больше, чем вы" : "Вы должны больше, чем вам"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNav("lent")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 glow-purple">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-purple rounded-xl flex items-center justify-center"><Icon name="TrendingUp" size={16} className="text-white" /></div>
            <span className="text-xs text-muted-foreground">Выдано</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-purple">{fmt(totalLent)}</p>
          <p className="text-xs text-muted-foreground mt-1">{lentDebts.length} займов</p>
        </button>

        <button onClick={() => onNav("borrowed")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 glow-blue">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-blue rounded-xl flex items-center justify-center"><Icon name="TrendingDown" size={16} className="text-white" /></div>
            <span className="text-xs text-muted-foreground">Взято</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-blue">{fmt(totalBorrowed)}</p>
          <p className="text-xs text-muted-foreground mt-1">{borrowedDebts.length} займов</p>
        </button>

        <button onClick={() => onNav("notifications")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center"><Icon name="AlertCircle" size={16} className="text-red-400" /></div>
            <span className="text-xs text-muted-foreground">Просрочено</span>
          </div>
          <p className="text-2xl font-black font-heading text-red-400">{overdueCount}</p>
          <p className="text-xs text-muted-foreground mt-1">нужно внимание</p>
        </button>

        <button onClick={() => onNav("calendar")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center"><Icon name="CalendarDays" size={16} className="text-emerald-400" /></div>
            <span className="text-xs text-muted-foreground">Ближайший</span>
          </div>
          <p className="text-lg font-bold font-heading text-emerald-400">8 Мая</p>
          <p className="text-xs text-muted-foreground mt-1">Павел Чернов</p>
        </button>
      </div>

      {overdueCount > 0 && (
        <div className="glass rounded-2xl p-4 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse">
              <Icon name="AlertTriangle" size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-400 text-sm">Есть просроченные долги!</p>
              <p className="text-xs text-muted-foreground">{overdueCount} платежа требуют внимания</p>
            </div>
            <button onClick={() => onNav("notifications")} className="text-xs text-red-400 border border-red-500/30 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-colors whitespace-nowrap">
              Смотреть
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">Последние</h3>
          <button onClick={() => onNav("lent")} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Все →</button>
        </div>
        <div className="space-y-2">
          {[...lentDebts, ...borrowedDebts].slice(0, 4).map(d => {
            const contact = contacts.find(c => c.id === d.contactId);
            const col = contact ? getColor(contact.color) : null;
            return (
              <div key={d.id} className="glass rounded-xl p-3 flex items-center gap-3" style={{ borderLeft: col ? `2px solid ${col.hex}` : undefined }}>
                <Avatar initials={d.avatar} color={contact?.color} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{d.name}</p>
                </div>
                <StatusBadge status={d.status} />
                <p className={`font-bold text-sm flex-shrink-0 ${d.status === "overdue" ? "text-red-400" : "text-foreground"}`}>{fmt(d.amount)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Nav Config ───────────────────────────────────────────────────────────────
const navItems: { id: Section; icon: string; label: string; badge?: number }[] = [
  { id: "dashboard",     icon: "LayoutDashboard", label: "Главная"     },
  { id: "lent",          icon: "TrendingUp",       label: "Выдано"      },
  { id: "borrowed",      icon: "TrendingDown",     label: "Взято"       },
  { id: "calendar",      icon: "CalendarDays",     label: "Календарь"   },
  { id: "notifications", icon: "Bell",             label: "Уведомления", badge: 3 },
  { id: "archive",       icon: "Archive",          label: "Архив"       },
  { id: "contacts",      icon: "Users",            label: "Контакты"    },
];

const sectionTitles: Record<Section, string> = {
  dashboard:     "DebtFlow",
  lent:          "Выданные займы",
  borrowed:      "Взятые займы",
  calendar:      "Календарь",
  notifications: "Уведомления",
  archive:       "Архив",
  contacts:      "Контакты",
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const [section, setSection] = useState<Section>("dashboard");
  const [contacts, setContacts] = useState<Contact[]>(INIT_CONTACTS);

  function handleColorChange(id: number, color: ContactColor) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, color } : c));
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-foreground flex flex-col">
      <div className="mesh-bg" />

      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-heading font-black text-xl">
              {section === "dashboard" ? <span className="text-gradient-purple">DebtFlow</span> : sectionTitles[section]}
            </h1>
            {section === "dashboard" && <p className="text-xs text-muted-foreground">Управление долгами и займами</p>}
          </div>
          <div className="flex items-center gap-2">
            {section !== "notifications" && (
              <button onClick={() => setSection("notifications")} className="relative w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <Icon name="Bell" size={17} />
                <div className="absolute -top-0.5 -right-0.5 w-4 h-4 gradient-purple rounded-full flex items-center justify-center text-[9px] font-bold text-white">3</div>
              </button>
            )}
            <button className="w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
              <Icon name="Plus" size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-32 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          {section === "dashboard"     && <Dashboard onNav={setSection} contacts={contacts} />}
          {section === "lent"          && <DebtList debts={lentDebts} dir="lent" contacts={contacts} />}
          {section === "borrowed"      && <DebtList debts={borrowedDebts} dir="borrowed" contacts={contacts} />}
          {section === "calendar"      && <CalendarSection contacts={contacts} />}
          {section === "notifications" && <NotificationsSection />}
          {section === "archive"       && <ArchiveSection contacts={contacts} />}
          {section === "contacts"      && <ContactsSection contacts={contacts} onColorChange={handleColorChange} />}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 px-3 pb-5">
        <div className="max-w-lg mx-auto">
          <div className="glass-strong rounded-2xl px-2 py-2 flex items-center justify-around" style={{ borderColor: "rgba(168,85,247,0.2)" }}>
            {navItems.map(item => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all duration-200 flex-1 ${active ? "gradient-purple" : "hover:bg-white/10"}`}
                >
                  <Icon name={item.icon} size={active ? 20 : 18} className={active ? "text-white" : "text-muted-foreground"} />
                  <span className={`text-[9px] font-medium leading-none ${active ? "text-white" : "text-muted-foreground"}`}>{item.label}</span>
                  {item.badge && !active && (
                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">{item.badge}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
