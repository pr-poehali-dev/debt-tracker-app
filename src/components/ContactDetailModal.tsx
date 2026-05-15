import Icon from "@/components/ui/icon";
import { Avatar } from "@/components/index/SharedComponents";
import { type Contact, type Debt, getColor, fmt } from "@/components/index/types";

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

export default function ContactDetailModal({
  contact,
  lentDebts,
  borrowedDebts,
  archiveDebts,
  onClose,
  onEdit,
}: {
  contact: Contact | null;
  lentDebts: Debt[];
  borrowedDebts: Debt[];
  archiveDebts: Debt[];
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!contact) return null;
  const col = getColor(contact.color);

  const allActive = [...lentDebts, ...borrowedDebts].filter((d) => d.contactId === contact.id);
  const allArchive = archiveDebts.filter((d) => d.contactId === contact.id);

  const lentActive = lentDebts.filter((d) => d.contactId === contact.id);
  const borrowedActive = borrowedDebts.filter((d) => d.contactId === contact.id);

  const totalLent = lentActive.reduce((s, d) => s + d.amount, 0);
  const totalBorrowed = borrowedActive.reduce((s, d) => s + d.amount, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminders = allActive
    .filter((d) => d.dueDate)
    .map((d) => {
      const due = new Date(d.dueDate);
      due.setHours(0, 0, 0, 0);
      const days = Math.round((due.getTime() - today.getTime()) / 86400000);
      const isLent = lentActive.some((x) => x.id === d.id);
      return { debt: d, days, due, isLent };
    })
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const phoneDigits = digitsOnly(contact.phone);
  const tgUser = (contact.telegram || "").replace(/^@/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-card border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTop: `3px solid ${col.hex}` }}
      >
        <div className="flex items-start gap-3 mb-4">
          <Avatar initials={contact.avatar} color={contact.color} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-foreground truncate">{contact.name}</p>
            {contact.phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Icon name="Phone" size={11} />{contact.phone}
              </p>
            )}
            {contact.email && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Icon name="Mail" size={11} />{contact.email}
              </p>
            )}
            {tgUser && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Icon name="Send" size={11} />@{tgUser}
              </p>
            )}
          </div>
          <button onClick={onEdit} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/8 hover:bg-white/15 transition-colors flex-shrink-0" title="Редактировать">
            <Icon name="Pencil" size={18} />
          </button>
          <button onClick={onClose} aria-label="Закрыть" className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/15 transition-colors flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>
            <Icon name="X" size={20} className="text-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {phoneDigits && (
            <a
              href={`tel:+${phoneDigits}`}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15 transition-colors"
            >
              <Icon name="Phone" size={18} />
              <span className="text-xs font-medium">Позвонить</span>
            </a>
          )}
          {tgUser && (
            <a
              href={`https://t.me/${tgUser}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/15 transition-colors"
            >
              <Icon name="Send" size={18} />
              <span className="text-xs font-medium">Telegram</span>
            </a>
          )}
          {phoneDigits && (
            <a
              href={`sms:+${phoneDigits}`}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/15 transition-colors"
            >
              <Icon name="MessageSquare" size={18} />
              <span className="text-xs font-medium">SMS</span>
            </a>
          )}
        </div>

        {(totalLent > 0 || totalBorrowed > 0) && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {totalLent > 0 && (
              <div className="rounded-2xl p-3" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                <p className="text-[10px] text-muted-foreground">Должен вам</p>
                <p className="font-bold text-base" style={{ color: col.text }}>{fmt(totalLent)}</p>
              </div>
            )}
            {totalBorrowed > 0 && (
              <div className="rounded-2xl p-3 bg-sky-500/10 border border-sky-500/20">
                <p className="text-[10px] text-muted-foreground">Вы должны</p>
                <p className="font-bold text-base text-sky-400">{fmt(totalBorrowed)}</p>
              </div>
            )}
          </div>
        )}

        {contact.note && (
          <div className="mb-4 rounded-2xl p-3 bg-amber-500/5 border border-amber-500/20">
            <p className="text-[10px] text-amber-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Icon name="StickyNote" size={11} />Заметка
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{contact.note}</p>
          </div>
        )}

        {reminders.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
              <Icon name="BellRing" size={12} />Ближайшие напоминания
            </p>
            <div className="space-y-2">
              {reminders.slice(0, 5).map((r) => {
                const overdue = r.days < 0;
                const soon = r.days >= 0 && r.days <= 3;
                return (
                  <div
                    key={r.debt.id}
                    className={`rounded-2xl p-3 border ${overdue ? "bg-rose-500/10 border-rose-500/30" : soon ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/10"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.debt.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.isLent ? "Вернёт" : "Вернуть"} • {formatDate(r.debt.dueDate)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${r.isLent ? "text-emerald-400" : "text-sky-400"}`}>{fmt(r.debt.amount)}</p>
                        <p className={`text-[10px] ${overdue ? "text-rose-400" : soon ? "text-amber-400" : "text-muted-foreground"}`}>
                          {overdue ? `просрочено на ${Math.abs(r.days)} дн.` : r.days === 0 ? "сегодня" : `через ${r.days} дн.`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">История ({allActive.length + allArchive.length})</p>
          {allActive.length + allArchive.length === 0 && (
            <div className="rounded-2xl p-4 bg-white/5 border border-white/10 text-center text-sm text-muted-foreground">
              Пока нет долгов с этим контактом
            </div>
          )}
          <div className="space-y-2">
            {allActive.map((d) => {
              const isLent = lentActive.some((x) => x.id === d.id);
              return (
                <div key={`a-${d.id}`} className="rounded-2xl p-3 bg-white/5 border border-white/10 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {isLent ? "Вы выдали" : "Вы взяли"}{d.dueDate ? ` • ${formatDate(d.dueDate)}` : ""}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${isLent ? "text-emerald-400" : "text-sky-400"}`}>{fmt(d.amount)}</p>
                </div>
              );
            })}
            {allArchive.map((d) => (
              <div key={`h-${d.id}`} className="rounded-2xl p-3 bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2 opacity-70">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate line-through">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">Закрыт{d.dueDate ? ` • ${formatDate(d.dueDate)}` : ""}</p>
                </div>
                <p className="text-sm font-bold text-muted-foreground">{fmt(d.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}