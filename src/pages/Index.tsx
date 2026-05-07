import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import NewDebtModal, { SharedDebtView } from "@/components/NewDebtModal";
import { type Lang, LANGUAGES, getT } from "@/i18n";

// ─── Types ───────────────────────────────────────────────────────────────────
type Section = "dashboard" | "lent" | "borrowed" | "calendar" | "notifications" | "archive" | "contacts" | "settings";
type Theme = "dark" | "light";

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

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT_CONTACTS: Contact[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
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

function StatusBadge({ status, t }: { status: Debt["status"]; t: ReturnType<typeof getT> }) {
  const map = {
    active:  { label: t.statusActive,  cls: "bg-blue-500/15 text-blue-400 border border-blue-500/20"  },
    overdue: { label: t.statusOverdue, cls: "bg-red-500/15 text-red-400 border border-red-500/20"     },
    paid:    { label: t.statusPaid,    cls: "bg-green-500/15 text-green-400 border border-green-500/20"},
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
function DebtList({ debts, dir, contacts, t, locale }: { debts: Debt[]; dir: "lent" | "borrowed"; contacts: Contact[]; t: ReturnType<typeof getT>; locale: string }) {
  const total = debts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const overdue = debts.filter(d => d.status === "overdue").length;

  return (
    <div className="animate-fade-in">
      {debts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className={`glass rounded-2xl p-4 col-span-3 sm:col-span-1 ${dir === "lent" ? "glow-purple" : "glow-blue"}`}>
            <p className="text-muted-foreground text-xs mb-1">{dir === "lent" ? t.totalLent : t.totalBorrowed}</p>
            <p className={`text-2xl font-bold font-heading ${dir === "lent" ? "text-gradient-purple" : "text-gradient-blue"}`}>{fmt(total)}</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-muted-foreground text-xs mb-1">{t.active}</p>
            <p className="text-2xl font-bold font-heading text-foreground">{debts.filter(d => d.status === "active").length}</p>
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="text-muted-foreground text-xs mb-1">{t.overdue}</p>
            <p className="text-2xl font-bold font-heading text-red-400">{overdue}</p>
          </div>
        </div>
      )}

      {debts.length === 0 ? (
        <div className="glass rounded-2xl p-10 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Icon name={dir === "lent" ? "TrendingUp" : "TrendingDown"} size={32} className={dir === "lent" ? "text-purple-400" : "text-sky-400"} />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">{dir === "lent" ? "Вы ещё никому не давали в долг" : "Вы ещё не брали в долг"}</p>
            <p className="text-xs text-muted-foreground">Нажмите + чтобы добавить первый займ</p>
          </div>
        </div>
      ) : (
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
                    <StatusBadge status={d.status} t={t} />
                  </div>
                  {d.note && <p className="text-xs text-muted-foreground truncate">{d.note}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Icon name="Calendar" size={11} />
                    {new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
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
      )}

      <button className={`mt-4 w-full py-3 rounded-2xl glass border border-dashed ${dir === "lent" ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10"} transition-all duration-200 font-medium flex items-center justify-center gap-2`}>
        <Icon name="Plus" size={16} />
        {dir === "lent" ? t.addLent : t.addBorrowed}
      </button>
    </div>
  );
}

// ─── Section: Calendar ────────────────────────────────────────────────────────
function CalendarSection({ contacts, t, debts }: { contacts: Contact[]; t: ReturnType<typeof getT>; debts: Debt[] }) {
  const [calDate, setCalDate] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const daysInMonth = new Date(calDate.year, calDate.month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(calDate.year, calDate.month, 1).getDay() + 6) % 7;
  const todayRef = new Date();
  const isCurrentMonth = todayRef.getFullYear() === calDate.year && todayRef.getMonth() === calDate.month;
  const todayDay = isCurrentMonth ? todayRef.getDate() : -1;
  const monthName = t.months[calDate.month] + " " + calDate.year;

  const dayColors: Record<number, string[]> = {};
  debts.forEach(d => {
    const dd = new Date(d.dueDate);
    if (dd.getFullYear() === calDate.year && dd.getMonth() === calDate.month) {
      const contact = contacts.find(c => c.id === d.contactId);
      const hex = contact ? getColor(contact.color).hex : "#a855f7";
      if (!dayColors[dd.getDate()]) dayColors[dd.getDate()] = [];
      dayColors[dd.getDate()].push(hex);
    }
  });

  const upcomingDebts = debts
    .filter(d => { const dd = new Date(d.dueDate); return dd.getFullYear() === calDate.year && dd.getMonth() === calDate.month; })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <div className="animate-fade-in">
      <div className="glass rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-lg">{monthName}</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setCalDate(prev => { const d = new Date(prev.year, prev.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
              className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Icon name="ChevronLeft" size={16} />
            </button>
            <button
              onClick={() => setCalDate(prev => { const d = new Date(prev.year, prev.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
              className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Icon name="ChevronRight" size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {t.weekDays.map(d => (
            <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
            const isToday = d === todayDay;
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
                {hasEvent && !isToday && (
                  <div className="flex gap-0.5 absolute bottom-1">
                    {colors.slice(0, 3).map((hex, idx) => (
                      <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ background: hex }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {upcomingDebts.length > 0 && (
        <div className="glass rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3">
          {upcomingDebts.map((d, i) => {
            const contact = contacts.find(c => c.id === d.contactId);
            const col = contact ? getColor(contact.color) : getColor("purple");
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.hex }} />
                <span className="text-xs text-muted-foreground">{d.name.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="font-heading font-semibold mb-3 text-muted-foreground text-sm uppercase tracking-wider">{t.upcomingPayments}</h3>

      {debts.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3 mt-4">
          <Icon name="CalendarDays" size={32} className="text-purple-400" />
          <p className="font-semibold text-foreground">Нет предстоящих платежей</p>
          <p className="text-xs text-muted-foreground">Добавьте займ со сроком возврата</p>
        </div>
      )}

      <div className="space-y-3">
        {upcomingDebts.map((d, i) => {
          const contact = contacts.find(c => c.id === d.contactId);
          const col = contact ? getColor(contact.color) : getColor("purple");
          const dd = new Date(d.dueDate);
          return (
            <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3" style={{ borderLeft: `3px solid ${col.hex}` }}>
              <div
                className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: col.bg, border: `1px solid ${col.border}` }}
              >
                <span className="text-base font-bold text-foreground leading-none">{dd.getDate()}</span>
                <span className="text-[9px] text-muted-foreground">{t.months[dd.getMonth()]}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.hex }} />
                  <p className="font-medium text-foreground">{d.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t.pay}</p>
              </div>
              <div className="font-bold font-heading text-base flex-shrink-0" style={{ color: col.text }}>
                {fmt(d.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────
function NotificationsSection({ t }: { t: ReturnType<typeof getT> }) {
  const [notifs, setNotifs] = useState<Notification[]>([]);
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
              <p className="font-semibold text-red-400">{unread} {t.unreadNotifs}</p>
              <p className="text-xs text-muted-foreground">{t.needAttention}</p>
            </div>
            <button onClick={() => setNotifs(notifs.map(n => ({ ...n, read: true })))} className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              {t.markAllRead}
            </button>
          </div>
        </div>
      )}
      {notifs.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <Icon name="Bell" size={32} className="text-purple-400" />
          <p className="font-semibold text-foreground">Уведомлений нет</p>
          <p className="text-xs text-muted-foreground">Здесь будут появляться напоминания о платежах</p>
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
        {t.configureNotifs}
      </button>
    </div>
  );
}

// ─── Section: Archive ─────────────────────────────────────────────────────────
function ArchiveSection({ contacts, t, locale, archiveDebts }: { contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; archiveDebts: Debt[] }) {
  const total = archiveDebts.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="animate-fade-in">
      {archiveDebts.length > 0 && (
        <div className="glass rounded-2xl p-4 mb-5 bg-green-500/5 border border-green-500/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon name="CheckCircle2" size={20} className="text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-green-400">{t.paidOn} {fmt(total)}</p>
              <p className="text-xs text-muted-foreground">{archiveDebts.length} {t.completedTx}</p>
            </div>
          </div>
        </div>
      )}
      {archiveDebts.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <Icon name="Archive" size={32} className="text-purple-400 opacity-50" />
          <p className="font-semibold text-foreground">{t.archiveEmpty}</p>
          <p className="text-xs text-muted-foreground">{t.archiveEmptyDesc}</p>
        </div>
      )}
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
                  {new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold font-heading text-green-400">{fmt(d.amount)}</p>
                <StatusBadge status="paid" t={t} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Contacts ────────────────────────────────────────────────────────
function ContactsSection({ contacts, onColorChange, t }: { contacts: Contact[]; onColorChange: (id: number, color: ContactColor) => void; t: ReturnType<typeof getT> }) {
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="animate-fade-in">
      {contacts.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3 mb-4">
          <Icon name="Users" size={32} className="text-purple-400 opacity-50" />
          <p className="font-semibold text-foreground">{t.addContact}</p>
          <p className="text-xs text-muted-foreground">Контакты появятся здесь когда вы добавите первый займ</p>
        </div>
      )}
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
                  title={t.chooseColor}
                >
                  <div className="w-4 h-4 rounded-full" style={{ background: col.hex, boxShadow: `0 0 6px ${col.hex}` }} />
                </button>
              </div>

              {isEditing && (
                <div className="mb-3 p-3 rounded-xl" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                  <p className="text-xs mb-2" style={{ color: col.text }}>{t.contactColor}:</p>
                  <ColorPicker value={c.color} onChange={(newColor) => onColorChange(c.id, newColor)} />
                </div>
              )}

              <div className="flex gap-2">
                {c.totalLent > 0 && (
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                    <p className="text-[10px] mb-0.5" style={{ color: col.text + "aa" }}>{t.owesYou}</p>
                    <p className="font-bold text-sm" style={{ color: col.text }}>{fmt(c.totalLent)}</p>
                  </div>
                )}
                {c.totalBorrowed > 0 && (
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                    <p className="text-[10px] mb-0.5" style={{ color: col.text + "aa" }}>{t.youOwe}</p>
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
        {t.addContact}
      </button>
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────
function Dashboard({ onNav, contacts, t, lentDebts, borrowedDebts }: { onNav: (s: Section) => void; contacts: Contact[]; t: ReturnType<typeof getT>; lentDebts: Debt[]; borrowedDebts: Debt[] }) {
  const totalLent = lentDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const totalBorrowed = borrowedDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const balance = totalLent - totalBorrowed;
  const overdueCount = [...lentDebts, ...borrowedDebts].filter(d => d.status === "overdue").length;
  const allDebts = [...lentDebts, ...borrowedDebts];
  const isEmpty = allDebts.length === 0;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="relative rounded-3xl overflow-hidden p-6" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(99,102,241,0.2) 50%, rgba(56,189,248,0.2) 100%)", border: "1px solid rgba(168,85,247,0.3)" }}>
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 50%, rgba(168,85,247,0.5), transparent 60%)" }} />
        <div className="relative">
          <p className="text-muted-foreground text-sm mb-1">{t.totalBalance}</p>
          <p className={`text-4xl font-black font-heading mb-1 ${balance >= 0 ? "text-gradient-purple" : "text-red-400"}`}>
            {balance >= 0 ? "+" : ""}{fmt(balance)}
          </p>
          <p className="text-xs text-muted-foreground">{balance >= 0 ? t.youAreOwed : t.youOweTotal}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNav("lent")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 glow-purple">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-purple rounded-xl flex items-center justify-center"><Icon name="TrendingUp" size={16} className="text-white" /></div>
            <span className="text-xs text-muted-foreground">{t.navLent}</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-purple">{fmt(totalLent)}</p>
          <p className="text-xs text-muted-foreground mt-1">{lentDebts.filter(d => d.status !== "paid").length} {t.activeDebts.toLowerCase()}</p>
        </button>

        <button onClick={() => onNav("borrowed")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 glow-blue">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-blue rounded-xl flex items-center justify-center"><Icon name="TrendingDown" size={16} className="text-white" /></div>
            <span className="text-xs text-muted-foreground">{t.navBorrowed}</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-blue">{fmt(totalBorrowed)}</p>
          <p className="text-xs text-muted-foreground mt-1">{borrowedDebts.filter(d => d.status !== "paid").length} {t.activeDebts.toLowerCase()}</p>
        </button>

        <button onClick={() => onNav("notifications")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center"><Icon name="AlertCircle" size={16} className="text-red-400" /></div>
            <span className="text-xs text-muted-foreground">{t.overdue}</span>
          </div>
          <p className="text-2xl font-black font-heading text-red-400">{overdueCount}</p>
        </button>

        <button onClick={() => onNav("contacts")} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center"><Icon name="Users" size={16} className="text-emerald-400" /></div>
            <span className="text-xs text-muted-foreground">{t.navContacts}</span>
          </div>
          <p className="text-2xl font-black font-heading text-emerald-400">{contacts.length}</p>
        </button>
      </div>

      {overdueCount > 0 && (
        <div className="glass rounded-2xl p-4 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse">
              <Icon name="AlertTriangle" size={18} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-400 text-sm">{t.overdueDebts}</p>
              <p className="text-xs text-muted-foreground">{overdueCount} {t.overdue.toLowerCase()}</p>
            </div>
            <button onClick={() => onNav("notifications")} className="text-xs text-red-400 border border-red-500/30 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-colors whitespace-nowrap">
              →
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t.recentActivity}</h3>
          {!isEmpty && <button onClick={() => onNav("lent")} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">→</button>}
        </div>
        {isEmpty ? (
          <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <Icon name="Wallet" size={32} className="text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Долгов пока нет</p>
              <p className="text-xs text-muted-foreground">Нажмите + чтобы добавить первый займ</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {allDebts.slice(0, 4).map(d => {
              const contact = contacts.find(c => c.id === d.contactId);
              const col = contact ? getColor(contact.color) : null;
              return (
                <div key={d.id} className="glass rounded-xl p-3 flex items-center gap-3" style={{ borderLeft: col ? `2px solid ${col.hex}` : undefined }}>
                  <Avatar initials={d.avatar} color={contact?.color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{d.name}</p>
                  </div>
                  <StatusBadge status={d.status} t={t} />
                  <p className={`font-bold text-sm flex-shrink-0 ${d.status === "overdue" ? "text-red-400" : "text-foreground"}`}>{fmt(d.amount)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Settings ────────────────────────────────────────────────────────
function SettingsSection({ theme, onThemeChange, profile, onProfileChange, t, lang, onLangChange, email, onLogout }: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  profile: { name: string; phone: string };
  onProfileChange: (p: { name: string; phone: string }) => void;
  t: ReturnType<typeof getT>;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  email: string;
  onLogout: () => void;
}) {
  const [local, setLocal] = useState(profile);
  const [saved, setSaved] = useState(false);

  function save() {
    onProfileChange(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  const themes: { id: Theme; label: string; desc: string; icon: string; bg: string; preview: string[] }[] = [
    {
      id: "dark",
      label: t.themeDark,
      desc: t.themeDarkDesc,
      icon: "Moon",
      bg: "from-slate-900 to-slate-800",
      preview: ["#0d0f1a", "#1a1d2e", "#a855f7"],
    },
    {
      id: "light",
      label: t.themeLight,
      desc: t.themeLightDesc,
      icon: "Sun",
      bg: "from-purple-50 to-slate-100",
      preview: ["#f0f2f8", "#ffffff", "#a855f7"],
    },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <Icon name="Globe" size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{t.language}</p>
            <p className="text-xs text-muted-foreground">{t.languageDesc}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              onClick={() => onLangChange(l.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${lang === l.id ? "gradient-purple text-white" : "glass hover:bg-white/10 text-muted-foreground"}`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {lang === l.id && <Icon name="Check" size={14} className="ml-auto text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 gradient-purple rounded-xl flex items-center justify-center">
            <Icon name="User" size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{t.myProfile}</p>
            <p className="text-xs text-muted-foreground">{t.profileDesc}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t.name}</label>
            <input
              value={local.name}
              onChange={e => setLocal(l => ({ ...l, name: e.target.value }))}
              placeholder="Иван Иванов"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t.phone}</label>
            <input
              value={local.phone}
              onChange={e => setLocal(l => ({ ...l, phone: e.target.value }))}
              placeholder="+7 999 000 00 00"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          <button
            onClick={save}
            className="w-full py-2.5 rounded-xl font-semibold text-white text-sm transition-all"
            style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
          >
            {saved ? t.saved : t.save}
          </button>
        </div>
      </div>

      {/* Theme picker */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 gradient-purple rounded-xl flex items-center justify-center">
            <Icon name="Palette" size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{t.themeTitle}</p>
            <p className="text-xs text-muted-foreground">{t.themeDesc}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {themes.map(t => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onThemeChange(t.id)}
                className={`relative rounded-2xl p-4 text-left transition-all duration-200 overflow-hidden ${active ? "ring-2 ring-purple-500" : "ring-1 ring-white/10 hover:ring-purple-500/40"}`}
                style={{ background: t.id === "dark" ? "linear-gradient(135deg, #0d0f1a, #1a1d2e)" : "linear-gradient(135deg, #f0f2f8, #ffffff)" }}
              >
                {/* Colour dots preview */}
                <div className="flex gap-1 mb-3">
                  {t.preview.map((c, i) => (
                    <div key={i} className="w-5 h-5 rounded-full" style={{ background: c }} />
                  ))}
                </div>

                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon name={t.icon} size={14} className={t.id === "dark" ? "text-purple-400" : "text-purple-600"} />
                  <span className={`font-semibold text-sm ${t.id === "dark" ? "text-white" : "text-slate-800"}`}>{t.label}</span>
                </div>
                <p className={`text-[11px] leading-tight ${t.id === "dark" ? "text-slate-400" : "text-slate-500"}`}>{t.desc}</p>

                {active && (
                  <div className="absolute top-2 right-2 w-5 h-5 gradient-purple rounded-full flex items-center justify-center">
                    <Icon name="Check" size={11} className="text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* System auto */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-sky-500/20 rounded-xl flex items-center justify-center">
            <Icon name="Monitor" size={18} className="text-sky-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{t.autoTheme}</p>
            <p className="text-xs text-muted-foreground">{t.autoThemeDesc}</p>
          </div>
          <button
            onClick={() => {
              const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
              onThemeChange(prefersDark ? "dark" : "light");
            }}
            className="ml-auto px-3 py-1.5 rounded-xl text-xs font-medium glass hover:bg-white/10 transition-colors text-muted-foreground"
          >
            {t.apply}
          </button>
        </div>
      </div>

      {/* App info */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Icon name="Info" size={18} className="text-purple-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{t.aboutApp}</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          {[
            { label: t.appNameLabel, value: "Debt-Debt" },
            { label: t.version, value: "1.0.0" },
            { label: t.platform, value: "PWA (iOS / Android)" },
            { label: "Email", value: email },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-foreground font-medium truncate ml-2 max-w-[180px] text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Admin Panel */}
      {email === "elovyh@liust.ru" && (
        <button
          onClick={() => window.location.href = "/admin"}
          className="w-full py-3 rounded-2xl glass border border-purple-500/20 text-purple-400 hover:bg-purple-500/10 transition-all font-medium flex items-center justify-center gap-2"
        >
          <Icon name="ShieldCheck" size={16} />
          Админ-панель
        </button>
      )}

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full py-3 rounded-2xl glass border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all font-medium flex items-center justify-center gap-2"
      >
        <Icon name="LogOut" size={16} />
        Выйти из аккаунта
      </button>
    </div>
  );
}

// ─── PWA Install Banner ───────────────────────────────────────────────────────
function InstallBanner({ t }: { t: ReturnType<typeof getT> }) {
  const [prompt, setPrompt] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.navigator as { standalone?: boolean }).standalone;
    setIsIos(ios);
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);

    const handler = (e: Event) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || isInstalled) return null;
  if (!prompt && !isIos) return null;

  async function install() {
    if (prompt) {
      const deferredPrompt = prompt as { prompt: () => void; userChoice: Promise<{ outcome: string }> };
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDismissed(true);
    }
  }

  return (
    <div className="relative z-10 px-4 pb-2">
      <div className="max-w-lg mx-auto">
        <div
          className="rounded-2xl p-3 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(56,189,248,0.15))", border: "1px solid rgba(168,85,247,0.3)" }}
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
            <img src="/icons/icon-192.png" alt="Debt-Debt" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">{t.installApp}</p>
            <p className="text-xs text-muted-foreground">
              {isIos ? t.iosHint : t.installDesc}
            </p>
          </div>
          <div className="flex gap-1.5">
            {!isIos && (
              <button
                onClick={install}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
              >
                {t.install}
              </button>
            )}
            <button onClick={() => setDismissed(true)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
              <Icon name="X" size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
interface AuthUser { id: number; full_name: string; phone: string; email: string; }

export default function Index({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [section, setSection] = useState<Section>("dashboard");
  const [contacts, setContacts] = useState<Contact[]>(INIT_CONTACTS);
  const [lentDebts, setLentDebts] = useState<Debt[]>([]);
  const [borrowedDebts, setBorrowedDebts] = useState<Debt[]>([]);
  const [archiveDebts, setArchiveDebts] = useState<Debt[]>([]);
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("df-theme") as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  const [profile, setProfile] = useState<{ name: string; phone: string }>({
    name: user.full_name,
    phone: user.phone,
  });

  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem("df-lang") as Lang) || "ru";
  });
  function handleLangChange(l: Lang) {
    setLang(l);
    localStorage.setItem("df-lang", l);
  }
  const t = getT(lang);
  const locale = lang === "zh" ? "zh-CN" : lang === "fr" ? "fr-FR" : lang === "en" ? "en-US" : "ru-RU";

  const navItems = [
    { id: "dashboard" as Section,     icon: "LayoutDashboard", label: t.navDashboard },
    { id: "lent" as Section,          icon: "TrendingUp",       label: t.navLent },
    { id: "borrowed" as Section,      icon: "TrendingDown",     label: t.navBorrowed },
    { id: "calendar" as Section,      icon: "CalendarDays",     label: t.navCalendar },
    { id: "notifications" as Section, icon: "Bell",             label: t.navNotifications },
    { id: "archive" as Section,       icon: "Archive",          label: t.navArchive },
    { id: "contacts" as Section,      icon: "Users",            label: t.navContacts },
  ];
  const sectionTitles: Record<Section, string> = {
    dashboard: t.appName, lent: t.titleLent, borrowed: t.titleBorrowed,
    calendar: t.titleCalendar, notifications: t.titleNotifications,
    archive: t.titleArchive, contacts: t.titleContacts, settings: t.navSettings,
  };

  function handleProfileChange(p: { name: string; phone: string }) {
    setProfile(p);
    localStorage.setItem("df-profile", JSON.stringify(p));
  }

  // Применяем класс темы на <html>
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("theme-light", theme === "light");
    document.body.style.background = theme === "light" ? "#f0f2f8" : "#0d0f1a";
    localStorage.setItem("df-theme", theme);
  }, [theme]);

  // Обработка QR-ссылки: /?debt=TOKEN
  const debtToken = new URLSearchParams(window.location.search).get("debt");
  if (debtToken) return <SharedDebtView token={debtToken} />;

  function handleColorChange(id: number, color: ContactColor) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, color } : c));
  }

  return (
    <div className={`min-h-screen text-foreground flex flex-col`} style={{ background: "var(--app-bg)" }}>
      <div className="mesh-bg" />
      <NewDebtModal open={showNewDebt} onClose={() => setShowNewDebt(false)} myName={profile.name} myPhone={profile.phone} />

      <header className="relative z-10 px-4 pt-5 pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-heading font-black text-xl">
              {section === "dashboard" ? <span className="text-gradient-purple">Debt-Debt</span> : sectionTitles[section]}
            </h1>
            {section === "dashboard" && <p className="text-xs text-muted-foreground">{t.appSubtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {section !== "notifications" && (
              <button onClick={() => setSection("notifications")} className="relative w-9 h-9 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <Icon name="Bell" size={17} />
              </button>
            )}
            <button onClick={() => setSection("settings")} className={`w-9 h-9 glass rounded-xl flex items-center justify-center transition-colors ${section === "settings" ? "gradient-purple" : "hover:bg-white/10"}`}>
              <Icon name="Settings" size={17} className={section === "settings" ? "text-white" : ""} />
            </button>
            <button
              onClick={() => setShowNewDebt(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors gradient-purple glow-purple"
            >
              <Icon name="Plus" size={17} className="text-white" />
            </button>
          </div>
        </div>
      </header>

      <InstallBanner t={t} />

      <main className="relative z-10 flex-1 px-4 pb-32 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          {section === "dashboard"     && <Dashboard onNav={setSection} contacts={contacts} t={t} lentDebts={lentDebts} borrowedDebts={borrowedDebts} />}
          {section === "lent"          && <DebtList debts={lentDebts} dir="lent" contacts={contacts} t={t} locale={locale} />}
          {section === "borrowed"      && <DebtList debts={borrowedDebts} dir="borrowed" contacts={contacts} t={t} locale={locale} />}
          {section === "calendar"      && <CalendarSection contacts={contacts} t={t} debts={[...lentDebts, ...borrowedDebts]} />}
          {section === "notifications" && <NotificationsSection t={t} />}
          {section === "archive"       && <ArchiveSection contacts={contacts} t={t} locale={locale} archiveDebts={archiveDebts} />}
          {section === "contacts"      && <ContactsSection contacts={contacts} onColorChange={handleColorChange} t={t} />}
          {section === "settings"      && <SettingsSection theme={theme} onThemeChange={setTheme} profile={profile} onProfileChange={handleProfileChange} t={t} lang={lang} onLangChange={handleLangChange} email={user.email} onLogout={onLogout} />}
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