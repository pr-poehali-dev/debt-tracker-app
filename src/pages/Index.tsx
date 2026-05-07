import { useState } from "react";
import Icon from "@/components/ui/icon";

// ─── Types ───────────────────────────────────────────────────────────────────
type Section = "dashboard" | "lent" | "borrowed" | "calendar" | "notifications" | "archive" | "contacts";

interface Debt {
  id: number;
  name: string;
  amount: number;
  dueDate: string;
  status: "active" | "overdue" | "paid";
  avatar: string;
  note?: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  totalLent: number;
  totalBorrowed: number;
}

interface Notification {
  id: number;
  type: "warning" | "danger" | "info" | "success";
  title: string;
  message: string;
  date: string;
  read: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const lentDebts: Debt[] = [
  { id: 1, name: "Алексей Смирнов", amount: 25000, dueDate: "2026-05-15", status: "active", avatar: "АС", note: "Займ на ремонт" },
  { id: 2, name: "Мария Козлова", amount: 8500, dueDate: "2026-05-10", status: "overdue", avatar: "МК", note: "До зарплаты" },
  { id: 3, name: "Дмитрий Иванов", amount: 50000, dueDate: "2026-06-01", status: "active", avatar: "ДИ", note: "Бизнес-кредит" },
  { id: 4, name: "Елена Петрова", amount: 3200, dueDate: "2026-04-30", status: "overdue", avatar: "ЕП" },
  { id: 5, name: "Сергей Волков", amount: 15000, dueDate: "2026-07-15", status: "active", avatar: "СВ", note: "Покупка ноутбука" },
];

const borrowedDebts: Debt[] = [
  { id: 6, name: "Николай Федоров", amount: 12000, dueDate: "2026-05-20", status: "active", avatar: "НФ", note: "Отдать в мае" },
  { id: 7, name: "Анна Морозова", amount: 30000, dueDate: "2026-06-15", status: "active", avatar: "АМ", note: "Помогла с переездом" },
  { id: 8, name: "Павел Чернов", amount: 5000, dueDate: "2026-05-08", status: "overdue", avatar: "ПЧ" },
];

const contacts: Contact[] = [
  { id: 1, name: "Алексей Смирнов", phone: "+7 (999) 123-45-67", email: "alex@mail.ru", avatar: "АС", totalLent: 25000, totalBorrowed: 0 },
  { id: 2, name: "Мария Козлова", phone: "+7 (999) 234-56-78", email: "maria@gmail.com", avatar: "МК", totalLent: 8500, totalBorrowed: 0 },
  { id: 3, name: "Николай Федоров", phone: "+7 (999) 345-67-89", email: "nick@yandex.ru", avatar: "НФ", totalLent: 0, totalBorrowed: 12000 },
  { id: 4, name: "Анна Морозова", phone: "+7 (999) 456-78-90", email: "anna@mail.ru", avatar: "АМ", totalLent: 0, totalBorrowed: 30000 },
  { id: 5, name: "Дмитрий Иванов", phone: "+7 (999) 567-89-01", email: "dmitry@gmail.com", avatar: "ДИ", totalLent: 50000, totalBorrowed: 0 },
];

const notifications: Notification[] = [
  { id: 1, type: "danger", title: "Просрочен платёж", message: "Мария Козлова должна вернуть 8 500 ₽ — срок истёк 10 мая", date: "Сегодня", read: false },
  { id: 2, type: "danger", title: "Просрочен платёж", message: "Елена Петрова должна вернуть 3 200 ₽ — срок истёк 30 апреля", date: "Сегодня", read: false },
  { id: 3, type: "warning", title: "Скоро платёж", message: "Нужно отдать Павлу Чернову 5 000 ₽ — срок 8 мая", date: "Вчера", read: false },
  { id: 4, type: "warning", title: "Через 8 дней", message: "Алексей Смирнов должен вернуть 25 000 ₽ — срок 15 мая", date: "2 мая", read: true },
  { id: 5, type: "info", title: "Напоминание", message: "Не забудьте вернуть 12 000 ₽ Николаю Федорову до 20 мая", date: "1 мая", read: true },
  { id: 6, type: "success", title: "Долг погашен", message: "Сергей Волков погасил долг 20 000 ₽", date: "28 апреля", read: true },
];

const archiveDebts: Debt[] = [
  { id: 10, name: "Сергей Волков", amount: 20000, dueDate: "2026-04-28", status: "paid", avatar: "СВ", note: "Возвращено в срок" },
  { id: 11, name: "Ирина Белова", amount: 7000, dueDate: "2026-04-15", status: "paid", avatar: "ИБ" },
  { id: 12, name: "Олег Тихонов", amount: 45000, dueDate: "2026-03-30", status: "paid", avatar: "ОТ", note: "Бизнес-займ" },
];

const calendarEvents = [
  { day: 8, month: "Май", type: "danger", name: "Павел Чернов", amount: 5000, dir: "pay" },
  { day: 10, month: "Май", type: "overdue", name: "Мария Козлова", amount: 8500, dir: "receive" },
  { day: 15, month: "Май", type: "warning", name: "Алексей Смирнов", amount: 25000, dir: "receive" },
  { day: 20, month: "Май", type: "info", name: "Николай Федоров", amount: 12000, dir: "pay" },
  { day: 1, month: "Июнь", type: "info", name: "Дмитрий Иванов", amount: 50000, dir: "receive" },
  { day: 15, month: "Июнь", type: "info", name: "Анна Морозова", amount: 30000, dir: "pay" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function StatusBadge({ status }: { status: Debt["status"] }) {
  const map = {
    active: { label: "Активен", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/20" },
    overdue: { label: "Просрочен", cls: "bg-red-500/15 text-red-400 border border-red-500/20" },
    paid: { label: "Погашен", cls: "bg-green-500/15 text-green-400 border border-green-500/20" },
  };
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}

function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" };
  const gradients = [
    "from-purple-500 to-indigo-500",
    "from-sky-500 to-blue-600",
    "from-pink-500 to-purple-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
  ];
  const idx = initials.charCodeAt(0) % gradients.length;
  return (
    <div className={`${sizes[size]} rounded-2xl bg-gradient-to-br ${gradients[idx]} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initials}
    </div>
  );
}

function NotifIcon({ type }: { type: Notification["type"] }) {
  const map: Record<Notification["type"], { icon: string; cls: string }> = {
    danger: { icon: "AlertCircle", cls: "text-red-400 bg-red-500/15" },
    warning: { icon: "Clock", cls: "text-amber-400 bg-amber-500/15" },
    info: { icon: "Bell", cls: "text-blue-400 bg-blue-500/15" },
    success: { icon: "CheckCircle2", cls: "text-green-400 bg-green-500/15" },
  };
  const m = map[type];
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.cls}`}>
      <Icon name={m.icon} size={18} />
    </div>
  );
}

// ─── Section: Debts ───────────────────────────────────────────────────────────
function DebtList({ debts, dir }: { debts: Debt[]; dir: "lent" | "borrowed" }) {
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
        {debts.map((d, i) => (
          <div
            key={d.id}
            className="glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer group"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <Avatar initials={d.avatar} />
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
              <p className={`text-lg font-bold font-heading ${d.status === "overdue" ? "text-red-400" : dir === "lent" ? "text-purple-400" : "text-sky-400"}`}>
                {fmt(d.amount)}
              </p>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>

      <button className={`mt-4 w-full py-3 rounded-2xl glass border border-dashed ${dir === "lent" ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10"} transition-all duration-200 font-medium flex items-center justify-center gap-2`}>
        <Icon name="Plus" size={16} />
        {dir === "lent" ? "Добавить выданный займ" : "Добавить взятый займ"}
      </button>
    </div>
  );
}

// ─── Section: Calendar ────────────────────────────────────────────────────────
function CalendarSection() {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const today = 7;
  const eventDays = calendarEvents.filter(e => e.month === "Май").map(e => e.day);

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
            const hasEvent = eventDays.includes(d);
            const isOverdue = calendarEvents.find(e => e.month === "Май" && e.day === d) && d < today;
            return (
              <div
                key={d}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium cursor-pointer transition-all duration-200 relative
                  ${isToday ? "gradient-purple text-white glow-purple font-bold" : "hover:bg-white/10"}
                  ${hasEvent && !isToday ? "bg-white/5 border border-purple-500/30" : ""}
                `}
              >
                {d}
                {hasEvent && !isToday && (
                  <div className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${isOverdue ? "bg-red-400" : "bg-purple-400"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <h3 className="font-heading font-semibold mb-3 text-muted-foreground text-sm uppercase tracking-wider">Предстоящие платежи</h3>
      <div className="space-y-3">
        {calendarEvents.map((ev, i) => (
          <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border ${ev.type === "danger" || ev.type === "overdue" ? "bg-red-500/20 border-red-500/30" : ev.type === "warning" ? "bg-amber-500/20 border-amber-500/30" : "bg-blue-500/20 border-blue-500/30"}`}>
              <span className="text-base font-bold text-foreground leading-none">{ev.day}</span>
              <span className="text-[9px] text-muted-foreground">{ev.month}</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">{ev.name}</p>
              <p className="text-xs text-muted-foreground">{ev.dir === "receive" ? "Получить от должника" : "Вернуть кредитору"}</p>
            </div>
            <div className={`font-bold font-heading text-base flex-shrink-0 ${ev.dir === "receive" ? "text-purple-400" : "text-sky-400"}`}>
              {ev.dir === "receive" ? "+" : "−"}{fmt(ev.amount)}
            </div>
          </div>
        ))}
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
            <button
              onClick={() => setNotifs(notifs.map(n => ({ ...n, read: true })))}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              Прочитать все
            </button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {notifs.map((n, i) => (
          <div
            key={n.id}
            className={`glass rounded-2xl p-4 flex items-start gap-3 transition-all duration-200 hover:bg-white/[0.06] ${!n.read ? "border border-white/10" : "opacity-60"}`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
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
function ArchiveSection() {
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
        {archiveDebts.map((d, i) => (
          <div key={d.id} className="glass rounded-2xl p-4 flex items-center gap-4 opacity-80 hover:opacity-100 transition-opacity" style={{ animationDelay: `${i * 0.05}s` }}>
            <Avatar initials={d.avatar} />
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
        ))}
      </div>
    </div>
  );
}

// ─── Section: Contacts ────────────────────────────────────────────────────────
function ContactsSection() {
  return (
    <div className="animate-fade-in">
      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div key={c.id} className="glass rounded-2xl p-4 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer group" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="flex items-center gap-4 mb-3">
              <Avatar initials={c.avatar} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Icon name="Phone" size={11} />{c.phone}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon name="Mail" size={11} />{c.email}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
              </div>
            </div>
            <div className="flex gap-2">
              {c.totalLent > 0 && (
                <div className="flex-1 bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-purple-400/70 mb-0.5">Должен вам</p>
                  <p className="font-bold text-purple-400 text-sm">{fmt(c.totalLent)}</p>
                </div>
              )}
              {c.totalBorrowed > 0 && (
                <div className="flex-1 bg-sky-500/10 border border-sky-500/20 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-sky-400/70 mb-0.5">Вы должны</p>
                  <p className="font-bold text-sky-400 text-sm">{fmt(c.totalBorrowed)}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="mt-4 w-full py-3 rounded-2xl glass border border-dashed border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all duration-200 font-medium flex items-center justify-center gap-2">
        <Icon name="UserPlus" size={16} />
        Добавить контакт
      </button>
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────
function Dashboard({ onNav }: { onNav: (s: Section) => void }) {
  const totalLent = lentDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const totalBorrowed = borrowedDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const balance = totalLent - totalBorrowed;
  const overdueCount = [...lentDebts, ...borrowedDebts].filter(d => d.status === "overdue").length;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Balance hero */}
      <div
        className="relative rounded-3xl overflow-hidden p-6"
        style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(99,102,241,0.2) 50%, rgba(56,189,248,0.2) 100%)", border: "1px solid rgba(168,85,247,0.3)" }}
      >
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 50%, rgba(168,85,247,0.5), transparent 60%)" }} />
        <div className="relative">
          <p className="text-muted-foreground text-sm mb-1">Чистый баланс</p>
          <p className={`text-4xl font-black font-heading mb-1 ${balance >= 0 ? "text-gradient-purple" : "text-red-400"}`}>
            {balance >= 0 ? "+" : ""}{fmt(balance)}
          </p>
          <p className="text-xs text-muted-foreground">
            {balance >= 0 ? "Вам должны больше, чем вы" : "Вы должны больше, чем вам"}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNav("lent")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 glow-purple">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-purple rounded-xl flex items-center justify-center">
              <Icon name="TrendingUp" size={16} className="text-white" />
            </div>
            <span className="text-xs text-muted-foreground">Выдано</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-purple">{fmt(totalLent)}</p>
          <p className="text-xs text-muted-foreground mt-1">{lentDebts.length} займов</p>
        </button>

        <button onClick={() => onNav("borrowed")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 glow-blue">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-blue rounded-xl flex items-center justify-center">
              <Icon name="TrendingDown" size={16} className="text-white" />
            </div>
            <span className="text-xs text-muted-foreground">Взято</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-blue">{fmt(totalBorrowed)}</p>
          <p className="text-xs text-muted-foreground mt-1">{borrowedDebts.length} займов</p>
        </button>

        <button onClick={() => onNav("notifications")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center">
              <Icon name="AlertCircle" size={16} className="text-red-400" />
            </div>
            <span className="text-xs text-muted-foreground">Просрочено</span>
          </div>
          <p className="text-2xl font-black font-heading text-red-400">{overdueCount}</p>
          <p className="text-xs text-muted-foreground mt-1">нужно внимание</p>
        </button>

        <button onClick={() => onNav("calendar")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <Icon name="CalendarDays" size={16} className="text-emerald-400" />
            </div>
            <span className="text-xs text-muted-foreground">Ближайший</span>
          </div>
          <p className="text-lg font-bold font-heading text-emerald-400">8 Мая</p>
          <p className="text-xs text-muted-foreground mt-1">Павел Чернов</p>
        </button>
      </div>

      {/* Overdue alert */}
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
            <button
              onClick={() => onNav("notifications")}
              className="text-xs text-red-400 border border-red-500/30 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-colors whitespace-nowrap"
            >
              Смотреть
            </button>
          </div>
        </div>
      )}

      {/* Recent */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">Последние</h3>
          <button onClick={() => onNav("lent")} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Все →</button>
        </div>
        <div className="space-y-2">
          {[...lentDebts, ...borrowedDebts].slice(0, 4).map(d => (
            <div key={d.id} className="glass rounded-xl p-3 flex items-center gap-3">
              <Avatar initials={d.avatar} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{d.name}</p>
              </div>
              <StatusBadge status={d.status} />
              <p className={`font-bold text-sm flex-shrink-0 ${d.status === "overdue" ? "text-red-400" : "text-foreground"}`}>{fmt(d.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Nav Config ───────────────────────────────────────────────────────────────
const navItems: { id: Section; icon: string; label: string; badge?: number }[] = [
  { id: "dashboard", icon: "LayoutDashboard", label: "Главная" },
  { id: "lent", icon: "TrendingUp", label: "Выдано" },
  { id: "borrowed", icon: "TrendingDown", label: "Взято" },
  { id: "calendar", icon: "CalendarDays", label: "Календарь" },
  { id: "notifications", icon: "Bell", label: "Уведомления", badge: 3 },
  { id: "archive", icon: "Archive", label: "Архив" },
  { id: "contacts", icon: "Users", label: "Контакты" },
];

const sectionTitles: Record<Section, string> = {
  dashboard: "DebtFlow",
  lent: "Выданные займы",
  borrowed: "Взятые займы",
  calendar: "Календарь",
  notifications: "Уведомления",
  archive: "Архив",
  contacts: "Контакты",
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Index() {
  const [section, setSection] = useState<Section>("dashboard");

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-foreground flex flex-col">
      <div className="mesh-bg" />

      {/* Header */}
      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-heading font-black text-xl">
              {section === "dashboard"
                ? <span className="text-gradient-purple">DebtFlow</span>
                : sectionTitles[section]}
            </h1>
            {section === "dashboard" && <p className="text-xs text-muted-foreground">Управление долгами и займами</p>}
          </div>
          <div className="flex items-center gap-2">
            {section !== "notifications" && (
              <button
                onClick={() => setSection("notifications")}
                className="relative w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
              >
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

      {/* Content */}
      <main className="relative z-10 flex-1 px-4 pb-32 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          {section === "dashboard" && <Dashboard onNav={setSection} />}
          {section === "lent" && <DebtList debts={lentDebts} dir="lent" />}
          {section === "borrowed" && <DebtList debts={borrowedDebts} dir="borrowed" />}
          {section === "calendar" && <CalendarSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "archive" && <ArchiveSection />}
          {section === "contacts" && <ContactsSection />}
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 px-3 pb-5">
        <div className="max-w-lg mx-auto">
          <div className="glass-strong rounded-2xl px-2 py-2 flex items-center justify-around" style={{ borderColor: "rgba(168,85,247,0.2)" }}>
            {navItems.map(item => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={`relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all duration-200 flex-1
                    ${active ? "gradient-purple" : "hover:bg-white/10"}`}
                >
                  <Icon
                    name={item.icon}
                    size={active ? 20 : 18}
                    className={active ? "text-white" : "text-muted-foreground"}
                  />
                  <span className={`text-[9px] font-medium leading-none ${active ? "text-white" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                  {item.badge && !active && (
                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
                      {item.badge}
                    </div>
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