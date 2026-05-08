import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import DebtDetailModal from "@/components/DebtDetailModal";
import { type Lang, LANGUAGES, getT } from "@/i18n";
import { type Section, type Theme, type Contact, type Debt, type Notification, type ContactColor, getColor, fmt, calcTotalWithInterest } from "./types";
import { Avatar, ColorPicker, StatusBadge, NotifIcon } from "./SharedComponents";

// ─── Section: DebtList ────────────────────────────────────────────────────────
export function DebtList({ debts, dir, contacts, t, locale, onOpenChat, onMarkPaid }: { debts: Debt[]; dir: "lent" | "borrowed"; contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; onOpenChat?: (debtId: string, title: string) => void; onMarkPaid?: (debtId: string) => void }) {
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const total = debts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const overdue = debts.filter(d => d.status === "overdue").length;

  return (
    <div className="animate-fade-in">
      <DebtDetailModal
        debt={selectedDebt}
        dir={dir}
        locale={locale}
        onClose={() => setSelectedDebt(null)}
        onOpenChat={onOpenChat}
        onMarkPaid={onMarkPaid}
      />
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
                onClick={() => setSelectedDebt(d)}
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
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Icon name="Calendar" size={11} />
                      {new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    {dir === "lent" && d.debtDbId && (
                      d.borrowerDecision === "accepted" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                          <Icon name="CheckCircle" size={9} /> Подтверждено
                        </span>
                      ) : d.borrowerDecision === "rejected" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(244,63,94,0.15)", color: "#fb7185" }}>
                          <Icon name="XCircle" size={9} /> Отклонено
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                          <Icon name="Clock" size={9} /> Ожидает
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                  {(() => {
                    const totalWithInterest = d.interestRate ? calcTotalWithInterest(d.amount, d.interestRate, d.interestType || "simple", d.dueDate) : null;
                    return (
                      <>
                        <p className="text-lg font-bold font-heading" style={{ color: d.status === "overdue" ? "#f87171" : col ? col.text : dir === "lent" ? "#c084fc" : "#7dd3fc" }}>
                          {fmt(totalWithInterest ?? d.amount)}
                        </p>
                        {totalWithInterest && totalWithInterest !== d.amount && (
                          <p className="text-xs text-muted-foreground">{fmt(d.amount)} + {d.interestRate}%</p>
                        )}
                      </>
                    );
                  })()}
                  {d.debtDbId && onOpenChat && d.borrowerDecision === "accepted" && (
                    <button
                      onClick={e => { e.stopPropagation(); onOpenChat(d.debtDbId!, d.name); }}
                      className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Icon name="MessageCircle" size={12} />
                      Чат
                    </button>
                  )}
                  {d.debtDbId && d.status !== "paid" && onMarkPaid && (
                    <button
                      onClick={e => { e.stopPropagation(); onMarkPaid(d.debtDbId!); }}
                      className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      <Icon name="CheckCircle2" size={12} />
                      Возвращён
                    </button>
                  )}
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
export function CalendarSection({ contacts, t, debts }: { contacts: Contact[]; t: ReturnType<typeof getT>; debts: Debt[] }) {
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
            <div key={d} className="text-center text-[11px] text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dots = dayColors[day] ?? [];
            const isToday = day === todayDay;
            return (
              <div
                key={day}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all ${isToday ? "gradient-purple text-white font-bold glow-purple" : dots.length > 0 ? "bg-white/5" : ""}`}
              >
                <span className="text-sm leading-none">{day}</span>
                {dots.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dots.slice(0, 3).map((hex, i) => (
                      <div key={i} className="w-1 h-1 rounded-full" style={{ background: hex }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {upcomingDebts.length === 0 && (
          <div className="glass rounded-2xl p-6 flex flex-col items-center text-center gap-2">
            <Icon name="CalendarDays" size={28} className="text-purple-400 opacity-50" />
            <p className="text-sm text-muted-foreground">{t.noDebtsThisMonth}</p>
          </div>
        )}
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
export function NotificationsSection({ notifs, onMarkAllRead, onMarkRead, t }: {
  notifs: Notification[];
  onMarkAllRead: () => void;
  onMarkRead: (id: number) => void;
  t: ReturnType<typeof getT>;
}) {
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
            <button onClick={onMarkAllRead} className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
              {t.markAllRead}
            </button>
          </div>
        </div>
      )}
      {notifs.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <Icon name="Bell" size={32} className="text-purple-400" />
          <p className="font-semibold text-foreground">Уведомлений нет</p>
          <p className="text-xs text-muted-foreground">Здесь будут появляться уведомления о ваших долгах</p>
        </div>
      )}
      <div className="space-y-3">
        {notifs.map((n, i) => (
          <div
            key={n.id}
            onClick={() => onMarkRead(n.id)}
            className={`glass rounded-2xl p-4 flex items-start gap-3 transition-all duration-200 hover:bg-white/[0.06] cursor-pointer ${!n.read ? "border border-white/10" : "opacity-60"}`}
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
    </div>
  );
}

// ─── Section: Archive ─────────────────────────────────────────────────────────
export function ArchiveSection({ contacts, t, locale, archiveDebts }: { contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; archiveDebts: Debt[] }) {
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
export function ContactsSection({ contacts, onColorChange, t }: { contacts: Contact[]; onColorChange: (id: number, color: ContactColor) => void; t: ReturnType<typeof getT> }) {
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
                  <div className="w-4 h-4 rounded-full" style={{ background: col.hex }} />
                </button>
              </div>
              {isEditing && (
                <div className="pt-2 border-t border-white/5">
                  <p className="text-xs text-muted-foreground mb-2">{t.chooseColor}</p>
                  <ColorPicker value={c.color} onChange={color => { onColorChange(c.id, color); setEditingId(null); }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {c.totalLent > 0 && (
                  <div className="rounded-xl p-2.5" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                    <p className="text-[10px] text-muted-foreground">{t.gave}</p>
                    <p className="font-bold text-sm" style={{ color: col.text }}>{fmt(c.totalLent)}</p>
                  </div>
                )}
                {c.totalBorrowed > 0 && (
                  <div className="rounded-xl p-2.5 bg-sky-500/10 border border-sky-500/20">
                    <p className="text-[10px] text-muted-foreground">{t.took}</p>
                    <p className="font-bold text-sm text-sky-400">{fmt(c.totalBorrowed)}</p>
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
export function Dashboard({ onNav, contacts, t, lentDebts, borrowedDebts, activeRentalCount = 0, totalRentalAmount = 0 }: { onNav: (s: Section) => void; contacts: Contact[]; t: ReturnType<typeof getT>; lentDebts: Debt[]; borrowedDebts: Debt[]; activeRentalCount?: number; totalRentalAmount?: number }) {
  const totalLent = lentDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const totalBorrowed = borrowedDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const balance = totalLent - totalBorrowed;
  const overdueCount = [...lentDebts, ...borrowedDebts].filter(d => d.status === "overdue").length;
  const allDebts = [...lentDebts, ...borrowedDebts];
  const isEmpty = allDebts.length === 0;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-5 gap-3">
        {/* Баланс — занимает 3 колонки */}
        <div className="col-span-3 relative rounded-3xl overflow-hidden p-4" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(99,102,241,0.2) 50%, rgba(56,189,248,0.2) 100%)", border: "1px solid rgba(168,85,247,0.3)" }}>
          <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 50%, rgba(168,85,247,0.5), transparent 60%)" }} />
          <div className="relative">
            <p className="text-muted-foreground text-xs mb-1">{t.totalBalance}</p>
            <p className={`text-2xl font-black font-heading mb-0.5 ${balance >= 0 ? "text-gradient-purple" : "text-red-400"}`}>
              {balance >= 0 ? "+" : ""}{fmt(balance)}
            </p>
            <p className="text-[10px] text-muted-foreground">{balance >= 0 ? t.youAreOwed : t.youOweTotal}</p>
          </div>
        </div>

        {/* Аренда — занимает 2 колонки */}
        <button onClick={() => onNav("rental")} className="col-span-2 relative rounded-3xl overflow-hidden p-4 text-left hover:opacity-90 transition-all" style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.25) 0%, rgba(6,148,162,0.15) 100%)", border: "1px solid rgba(20,184,166,0.35)" }}>
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 30% 50%, rgba(20,184,166,0.6), transparent 60%)" }} />
          <div className="relative">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="Home" size={12} style={{ color: "#5eead4" }} />
              <p className="text-[10px] text-muted-foreground">Аренда</p>
            </div>
            <p className="text-xl font-black font-heading mb-0.5" style={{ color: "#5eead4" }}>
              {activeRentalCount}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {activeRentalCount === 0 ? "нет аренд" : `${fmt(totalRentalAmount)}/мес`}
            </p>
          </div>
        </button>
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
export function SettingsSection({ theme, onThemeChange, profile, onProfileChange, t, lang, onLangChange, email, onLogout, isDemo }: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  profile: { name: string; phone: string };
  onProfileChange: (p: { name: string; phone: string }) => void;
  t: ReturnType<typeof getT>;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  email: string;
  onLogout: () => void;
  isDemo?: boolean;
}) {
  const [local, setLocal] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("df-sound-notif") !== "off");

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("df-sound-notif", next ? "on" : "off");
    if (next) {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const t = ctx.currentTime;
        const baseFreqs = [1318, 1567, 1760, 2093, 2349, 2637, 3136];
        for (let i = 0; i < 14; i++) {
          const offset = i * 0.055 + (Math.random() * 0.025);
          const freq = baseFreqs[i % baseFreqs.length] * (0.92 + Math.random() * 0.16);
          const envelope = i < 4 ? (i + 1) / 4 : Math.max(0.2, 1 - (i - 4) / 12);
          const vol = 0.45 * envelope;
          const decay = 0.12 + Math.random() * 0.15;
          [freq, freq * 2.76].forEach((f, hi) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = "sine"; osc.frequency.setValueAtTime(f, t + offset);
            gain.gain.setValueAtTime(hi === 0 ? vol : vol * 0.35, t + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, t + offset + decay);
            osc.start(t + offset); osc.stop(t + offset + decay + 0.05);
          });
        }
      } catch { /* ignore */ }
    }
  }

  function save() {
    onProfileChange(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const themes: { id: Theme; label: string; desc: string; icon: string; bg: string; preview: string[] }[] = [
    { id: "dark",  label: t.themeDark,  desc: t.themeDarkDesc,  icon: "Moon", bg: "from-slate-900 to-slate-800", preview: ["#0d0f1a", "#1a1d2e", "#a855f7"] },
    { id: "light", label: t.themeLight, desc: t.themeLightDesc, icon: "Sun",  bg: "from-purple-50 to-slate-100", preview: ["#f0f2f8", "#ffffff", "#a855f7"] },
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
          {themes.map(th => {
            const active = theme === th.id;
            return (
              <button
                key={th.id}
                onClick={() => onThemeChange(th.id)}
                className={`relative rounded-2xl p-4 text-left transition-all duration-200 overflow-hidden ${active ? "ring-2 ring-purple-500" : "ring-1 ring-white/10 hover:ring-purple-500/40"}`}
                style={{ background: th.id === "dark" ? "linear-gradient(135deg, #0d0f1a, #1a1d2e)" : "linear-gradient(135deg, #f0f2f8, #ffffff)" }}
              >
                <div className="flex gap-1 mb-3">
                  {th.preview.map((c, i) => (
                    <div key={i} className="w-5 h-5 rounded-full" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon name={th.icon} size={14} className={th.id === "dark" ? "text-purple-400" : "text-purple-600"} />
                  <span className={`font-semibold text-sm ${th.id === "dark" ? "text-white" : "text-slate-800"}`}>{th.label}</span>
                </div>
                <p className={`text-[11px] leading-tight ${th.id === "dark" ? "text-slate-400" : "text-slate-500"}`}>{th.desc}</p>
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

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: soundEnabled ? "rgba(20,184,166,0.2)" : "rgba(255,255,255,0.06)" }}>
              <Icon name={soundEnabled ? "Volume2" : "VolumeX"} size={18} className={soundEnabled ? "text-teal-400" : "text-muted-foreground"} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Звуковые уведомления</p>
              <p className="text-xs text-muted-foreground">{soundEnabled ? "Звук при получении оплаты" : "Звук отключён"}</p>
            </div>
          </div>
          <button onClick={toggleSound}
            className="relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
            style={{ background: soundEnabled ? "#14b8a6" : "rgba(255,255,255,0.1)" }}>
            <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200"
              style={{ left: soundEnabled ? "calc(100% - 22px)" : "2px" }} />
          </button>
        </div>
      </div>

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

      {email === "elovyh@liust.ru" && (
        <button
          onClick={() => window.location.href = "/admin"}
          className="w-full py-3 rounded-2xl glass border border-purple-500/20 text-purple-400 hover:bg-purple-500/10 transition-all font-medium flex items-center justify-center gap-2"
        >
          <Icon name="ShieldCheck" size={16} />
          Админ-панель
        </button>
      )}

      {isDemo ? (
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-2xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
        >
          <Icon name="UserPlus" size={16} className="text-white" />
          Зарегистрироваться
        </button>
      ) : (
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-2xl glass border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all font-medium flex items-center justify-center gap-2"
        >
          <Icon name="LogOut" size={16} />
          Выйти из аккаунта
        </button>
      )}
    </div>
  );
}

// ─── PWA Install Banner ───────────────────────────────────────────────────────
export function InstallBanner({ t }: { t: ReturnType<typeof getT> }) {
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