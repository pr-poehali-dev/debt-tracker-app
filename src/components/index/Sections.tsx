import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import DebtDetailModal from "@/components/DebtDetailModal";
import { type Lang, LANGUAGES, getT } from "@/i18n";
import { type Section, type Theme, type Contact, type Debt, type Notification, type ContactColor, getColor, fmt, calcTotalWithInterest } from "./types";
import { Avatar, ColorPicker, StatusBadge, NotifIcon } from "./SharedComponents";
import { type PersonalLoan } from "@/components/PersonalLoanModal";
import ExtraPaymentModal from "@/components/ExtraPaymentModal";
import { computeSchedule } from "@/lib/loanSchedule";
import ManualReturnModal from "@/components/ManualReturnModal";
import InviteFriendModal from "@/components/InviteFriendModal";
import { ensurePushSubscription, getPushStatus, isSubscribedToPush, unsubscribeFromPush, hardResetPush } from "@/lib/push";

// ─── Section: DebtList ────────────────────────────────────────────────────────

function playPaymentSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [880, 1175];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.08;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch { /* ignore */ }
}

export function DebtList({ debts, dir, contacts, t, locale, onOpenChat, onMarkPaid, onDeleteDebt, onAddNew, personalLoans = [], onPersonalLoanUpdate, token = "", userId, onPaymentAccepted, onTopUpDecided }: { debts: Debt[]; dir: "lent" | "borrowed"; contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; onOpenChat?: (debtId: string, title: string) => void; onMarkPaid?: (debtId: string) => void; onDeleteDebt?: (debtId: string) => Promise<void> | void; onAddNew?: () => void; personalLoans?: PersonalLoan[]; onPersonalLoanUpdate?: (loans: PersonalLoan[]) => void; token?: string; userId?: number; onPaymentAccepted?: (debtId: string, newAmount: number, fullyPaid: boolean) => void; onTopUpDecided?: (debtId: string, decision: "accepted" | "rejected", newAmount: number | null) => void }) {
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [extraLoan, setExtraLoan] = useState<PersonalLoan | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<Debt | null>(null);
  const [manualReturn, setManualReturn] = useState<Debt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "overdue">("all");
  const [openContractOnSelect, setOpenContractOnSelect] = useState(false);

  useEffect(() => {
    function onOpenDebt(e: Event) {
      const detail = (e as CustomEvent).detail as { debtDbId?: string; openContract?: boolean } | undefined;
      if (!detail?.debtDbId) return;
      const target = debts.find(d => d.debtDbId === detail.debtDbId);
      if (target) {
        setOpenContractOnSelect(!!detail.openContract);
        setSelectedDebt(target);
      }
    }
    function onSetFilter(e: Event) {
      const detail = (e as CustomEvent).detail as { dir?: "lent" | "borrowed"; filter?: "all" | "active" | "overdue" } | undefined;
      if (!detail?.filter) return;
      if (detail.dir && detail.dir !== dir) return;
      setFilter(detail.filter);
    }
    window.addEventListener("open-debt", onOpenDebt as EventListener);
    window.addEventListener("set-debt-filter", onSetFilter as EventListener);
    return () => {
      window.removeEventListener("open-debt", onOpenDebt as EventListener);
      window.removeEventListener("set-debt-filter", onSetFilter as EventListener);
    };
  }, [debts, dir]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  function markPaidWithFeedback(debtDbId: string) {
    if (!onMarkPaid) return;
    const d = debts.find(x => x.debtDbId === debtDbId);
    onMarkPaid(debtDbId);
    playPaymentSound();
    showToast(d ? t.debtMarkedPaidNamed.replace("{name}", d.name) : t.debtMarkedPaid);
  }
  const total = debts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const overdue = debts.filter(d => d.status === "overdue").length;
  const activeCount = debts.filter(d => d.status === "active" || d.status === "overdue").length;
  const visibleDebts = filter === "all"
    ? debts
    : filter === "active"
      ? debts.filter(d => d.status === "active" || d.status === "overdue")
      : debts.filter(d => d.status === "overdue");

  return (
    <div className="animate-fade-in">
      <DebtDetailModal
        debt={selectedDebt}
        dir={dir}
        locale={locale}
        onClose={() => { setSelectedDebt(null); setOpenContractOnSelect(false); }}
        onOpenChat={onOpenChat}
        onMarkPaid={onMarkPaid ? markPaidWithFeedback : undefined}
        token={token}
        userId={userId}
        autoOpenContract={openContractOnSelect}
        onPaymentAccepted={onPaymentAccepted}
        onTopUpDecided={onTopUpDecided}
        contactInfo={selectedDebt ? (() => { const c = contacts.find(x => x.id === selectedDebt.contactId); return c ? { name: c.name, phone: c.phone, email: c.email, telegram: c.telegram } : undefined; })() : undefined}
      />
      {manualReturn && manualReturn.debtDbId && (
        <ManualReturnModal
          debtId={manualReturn.debtDbId}
          debtTitle={manualReturn.name}
          defaultAmount={manualReturn.interestRate ? calcTotalWithInterest(manualReturn.amount, manualReturn.interestRate, manualReturn.interestType || "simple", manualReturn.dueDate) : manualReturn.amount}
          token={token}
          onClose={() => setManualReturn(null)}
          onSent={() => showToast(t.returnRequestSent)}
        />
      )}
      {confirmDelete && (() => {
        const isBorrower = dir === "borrowed";
        const descText = isBorrower
          ? t.deleteDebtDescBorrower
          : t.deleteDebtDescLender;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={deleting ? undefined : () => setConfirmDelete(null)} />
            <div
              className="relative w-full max-w-sm rounded-3xl overflow-hidden animate-fade-in border border-white/10 shadow-2xl"
              style={{ background: "#1a1d2e" }}
            >
              <div className="p-5 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                  <Icon name="Trash2" size={26} className="text-red-400" />
                </div>
                <p className="font-semibold text-foreground text-lg">{t.deleteDebtTitle}</p>
                <p className="text-sm text-muted-foreground">
                  «{confirmDelete.name}» — {fmt(confirmDelete.amount)}
                </p>
                <p className="text-xs text-muted-foreground">{descText}</p>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={async () => {
                    if (!confirmDelete.debtDbId || !onDeleteDebt) return;
                    setDeleting(true);
                    try {
                      await onDeleteDebt(confirmDelete.debtDbId);
                      showToast(t.debtDeletedNamed.replace("{name}", confirmDelete.name));
                      setConfirmDelete(null);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold text-sm shadow-lg shadow-red-500/20 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {deleting ? <Icon name="Loader2" size={16} className="animate-spin" /> : <><Icon name="Trash2" size={16} />{t.delete}</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {debts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className={`glass rounded-2xl p-4 col-span-3 sm:col-span-1 ${dir === "lent" ? "glow-purple" : "glow-blue"}`}>
            <p className="text-muted-foreground text-xs mb-1">{dir === "lent" ? t.totalLent : t.totalBorrowed}</p>
            <p className={`text-2xl font-bold font-heading ${dir === "lent" ? "text-gradient-purple" : "text-gradient-blue"}`}>{fmt(total)}</p>
          </div>
          <button
            type="button"
            onClick={() => setFilter(filter === "active" ? "all" : "active")}
            className="glass rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
            style={{
              outline: filter === "active" ? "2px solid rgba(168,85,247,0.55)" : "none",
              background: filter === "active" ? "rgba(168,85,247,0.10)" : undefined,
            }}
            aria-pressed={filter === "active"}
          >
            <p className="text-muted-foreground text-xs mb-1">{t.active}</p>
            <p className="text-2xl font-bold font-heading text-foreground">{activeCount}</p>
          </button>
          <button
            type="button"
            onClick={() => overdue > 0 && setFilter(filter === "overdue" ? "all" : "overdue")}
            disabled={overdue === 0}
            className="glass rounded-2xl p-4 text-left transition-all active:scale-[0.98] disabled:cursor-default"
            style={{
              outline: filter === "overdue" ? "2px solid rgba(239,68,68,0.6)" : "none",
              background: filter === "overdue" ? "rgba(239,68,68,0.10)" : undefined,
            }}
            aria-pressed={filter === "overdue"}
          >
            <p className="text-muted-foreground text-xs mb-1">{t.overdue}</p>
            <p className="text-2xl font-bold font-heading text-red-400">{overdue}</p>
          </button>
        </div>
      )}

      {filter !== "all" && (
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-xs text-muted-foreground">
            {filter === "overdue" ? "Только просроченные" : "Только активные"} · {visibleDebts.length}
          </p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-xs font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
          >
            <Icon name="X" size={12} /> Сбросить
          </button>
        </div>
      )}

      {debts.length === 0 ? (
        <div className="glass rounded-2xl p-10 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Icon name={dir === "lent" ? "TrendingUp" : "TrendingDown"} size={32} className={dir === "lent" ? "text-purple-400" : "text-sky-400"} />
          </div>
          <div>
            <p className="font-semibold text-foreground mb-1">{dir === "lent" ? t.emptyLentTitle : t.emptyBorrowedTitle}</p>
            <p className="text-xs text-muted-foreground">{t.emptyDebtsHint}</p>
          </div>
        </div>
      ) : visibleDebts.length === 0 ? (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Icon name="CheckCircle2" size={22} className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {filter === "overdue" ? "Просроченных долгов нет" : "Активных долгов нет"}
          </p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-xs font-medium text-purple-400 hover:text-purple-300 mt-1"
          >
            Показать все
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleDebts.map((d, i) => {
            const contact = contacts.find(c => c.id === d.contactId);
            const col = contact ? getColor(contact.color) : null;
            const isOverdue = d.status === "overdue";
            const hasPending = dir === "lent"
              ? (d.pendingPaymentsCount || 0) > 0
              : (d.pendingTopUpsCount || 0) > 0;
            return (
              <div
                key={d.id}
                onClick={() => setSelectedDebt(d)}
                className={`relative glass rounded-2xl p-4 flex items-start gap-4 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer group ${isOverdue ? "overdue-pulse" : ""} ${hasPending && !isOverdue ? "pending-green-pulse" : ""}`}
                style={{
                  animationDelay: `${i * 0.05}s`,
                  borderLeft: isOverdue
                    ? "3px solid #ef4444"
                    : hasPending
                      ? "3px solid #10b981"
                      : col ? `3px solid ${col.hex}` : undefined,
                  background: isOverdue
                    ? "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.02))"
                    : hasPending
                      ? "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(16,185,129,0.02))"
                      : undefined,
                  boxShadow: isOverdue ? "0 0 0 1px rgba(239,68,68,0.25) inset" : undefined,
                }}
              >
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <Avatar initials={d.avatar} color={contact?.color} imageUrl={d.counterpartyAvatarUrl} />
                  {(() => {
                    if (!d.dueDate) {
                      return (
                        <p className="text-[10px] flex items-center gap-0.5 whitespace-nowrap text-muted-foreground">
                          <Icon name="Infinity" size={10} />
                          Бессрочно
                        </p>
                      );
                    }
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0);
                    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
                    const isPaid = d.status === "paid";
                    let cls = "text-muted-foreground";
                    if (!isPaid) {
                      if (days < 0) cls = "text-red-400";
                      else if (days === 0) cls = "text-red-400 font-semibold";
                      else if (days === 1) cls = "text-amber-400 font-medium";
                    }
                    return (
                      <p className={`text-[10px] flex items-center gap-0.5 whitespace-nowrap ${cls}`}>
                        <Icon name="Calendar" size={10} />
                        {new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                      </p>
                    );
                  })()}
                  {isOverdue && (() => {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0);
                    const daysLate = Math.max(1, Math.round((today.getTime() - due.getTime()) / 86400000));
                    const plural = (n: number) => {
                      const mod10 = n % 10;
                      const mod100 = n % 100;
                      if (mod10 === 1 && mod100 !== 11) return "день";
                      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
                      return "дней";
                    };
                    return (
                      <div className="flex flex-col items-center gap-0.5">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.35)" }}
                          aria-label="Просрочено"
                          title={`Просрочено на ${daysLate} ${plural(daysLate)}`}
                        >
                          <Icon name="AlertTriangle" size={12} className="text-red-400" />
                        </div>
                        <p className="text-[9px] font-semibold text-red-400 leading-none whitespace-nowrap">
                          +{daysLate} {plural(daysLate)}
                        </p>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground break-words leading-snug">{d.name}</p>
                  {d.counterpartyName && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      <Icon name={dir === "lent" ? "ArrowUpRight" : "ArrowDownLeft"} size={10} className="inline mr-0.5 align-[-1px]" />
                      {d.counterpartyName}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={d.status} t={t} />
                    {dir === "lent" && d.debtDbId && (
                      d.borrowerDecision === "accepted" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                          <Icon name="CheckCircle" size={9} /> {t.debtConfirmed}
                        </span>
                      ) : d.borrowerDecision === "rejected" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(244,63,94,0.15)", color: "#fb7185" }}>
                          <Icon name="XCircle" size={9} /> {t.debtDismissed}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                          <Icon name="Clock" size={9} /> {t.debtAwaiting}
                        </span>
                      )
                    )}
                    {dir === "lent" && (d.pendingPaymentsCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold animate-pulse" style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", boxShadow: "0 0 12px rgba(16,185,129,0.5)" }}>
                        <Icon name="BellRing" size={10} />
                        {d.pendingPaymentsCount === 1 ? "Запрос на возврат" : `${d.pendingPaymentsCount} запроса`}
                      </span>
                    )}
                    {(d.pendingTopUpsCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold animate-pulse" style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "#fff", boxShadow: "0 0 12px rgba(168,85,247,0.5)" }}>
                        <Icon name="TrendingUp" size={10} />
                        {dir === "borrowed"
                          ? (d.pendingTopUpsCount === 1 ? "Запрос на увеличение" : `${d.pendingTopUpsCount} запроса`)
                          : "Ждёт ответа"}
                      </span>
                    )}
                  </div>
                  {d.note && <p className="text-xs text-muted-foreground mt-1 break-words">{d.note}</p>}
                  {d.deletedByLender && (
                    <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#f87171" }}>
                      <Icon name="Trash2" size={11} />
                      <span>{t.debtDeletedByLender}</span>
                    </p>
                  )}
                  {dir === "lent" && d.borrowerDismissed && (
                    <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#fb923c" }}>
                      <Icon name="EyeOff" size={11} />
                      <span>{t.debtDeletedByBorrower}</span>
                    </p>
                  )}
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
                  {d.debtDbId && d.status !== "paid" && (() => {
                    const dec = d.borrowerDecision;
                    if (dec === "accepted") return (
                      <span title={t.debtConfirmedTitle} className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                        <Icon name="Check" size={12} />
                      </span>
                    );
                    if (dec === "rejected") return (
                      <span title={t.debtRejectedTitle} className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                        <Icon name="X" size={12} />
                      </span>
                    );
                    return (
                      <span title={t.debtAwaitingTitle} className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>
                        <Icon name="Clock" size={11} />
                      </span>
                    );
                  })()}
                  <div className="flex items-center gap-1.5">
                    {d.debtDbId && onOpenChat && d.borrowerDecision === "accepted" && (
                      <button
                        onClick={e => { e.stopPropagation(); onOpenChat(d.debtDbId!, d.name); }}
                        title={t.openChat}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95"
                        style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)" }}
                      >
                        <Icon name="MessageCircle" size={14} style={{ color: "#a855f7" }} />
                      </button>
                    )}
                    {dir === "borrowed" && d.debtDbId && d.status !== "paid" && d.borrowerDecision === "accepted" && (
                      <button
                        onClick={e => { e.stopPropagation(); setManualReturn(d); }}
                        title={t.returnedOutside}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg transition-all active:scale-95 text-xs font-medium"
                        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }}
                      >
                        <Icon name="HandCoins" size={14} />
                        <span className="whitespace-nowrap">{t.returnedOutside}</span>
                      </button>
                    )}
                    {dir === "lent" && d.debtDbId && d.status !== "paid" && onDeleteDebt && (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(d); }}
                        title={t.delete}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all active:scale-95"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
                      >
                        <Icon name="Trash2" size={14} style={{ color: "#f87171" }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Личные займы (только в разделе "Взятые") */}
      {dir === "borrowed" && personalLoans.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider">{t.personalLoansTitle}</p>
          {personalLoans.map(loan => {
            const sched = computeSchedule(loan);
            const monthCount = sched.monthCount;
            const paid = loan.paidMonths.length;
            const remaining = sched.remaining;
            const isExpanded = expandedLoan === loan.id;
            const extras = loan.extraPayments || [];

            function togglePaid(month: string) {
              if (!onPersonalLoanUpdate) return;
              const already = loan.paidMonths.includes(month);
              const updated = already
                ? loan.paidMonths.filter(m => m !== month)
                : [...loan.paidMonths, month];
              onPersonalLoanUpdate(personalLoans.map(l => l.id === loan.id ? { ...l, paidMonths: updated } : l));
              if (!already) {
                playPaymentSound();
                const [yy, mm] = month.split("-");
                showToast(`Платёж за ${t.monthsShort[parseInt(mm) - 1]} ${yy} внесён`/* TODO: i18n */);
              }
            }

            function deleteLoan() {
              if (!onPersonalLoanUpdate) return;
              onPersonalLoanUpdate(personalLoans.filter(l => l.id !== loan.id));
            }

            function removeExtra(extraId: string) {
              if (!onPersonalLoanUpdate) return;
              onPersonalLoanUpdate(personalLoans.map(l => l.id === loan.id ? { ...l, extraPayments: (l.extraPayments || []).filter(e => e.id !== extraId) } : l));
            }

            return (
              <div key={loan.id} className="glass rounded-2xl p-4 space-y-3" style={{ borderLeft: "3px solid rgba(56,189,248,0.4)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{loan.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.personalLoan} · {t.loanPaidOnDay.replace("{day}", String(loan.notifyDay))}
                      {loan.interestRate ? ` · ${loan.interestRate}%` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold font-heading" style={{ color: "#7dd3fc" }}>{fmt(remaining > 0 ? remaining : 0)}</p>
                    <p className="text-xs text-muted-foreground">{t.remaining}</p>
                  </div>
                </div>

                {/* Платёж сейчас */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t.monthlyPayment}</span>
                  <span className="font-semibold text-foreground">{fmt(sched.currentMonthly)}</span>
                </div>

                {/* Прогресс */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t.paidOfTotal.replace("{n}", String(paid)).replace("{total}", String(monthCount))}</span>
                    <span>{Math.round(paid / Math.max(1, monthCount) * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${paid / Math.max(1, monthCount) * 100}%`, background: "linear-gradient(90deg, #38bdf8, #0ea5e9)" }} />
                  </div>
                </div>

                {/* Кнопка досрочного платежа */}
                <button onClick={() => setExtraLoan(loan)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #38bdf8, #0ea5e9)" }}>
                  <Icon name="Wallet" size={16} />
                  {t.deposit}
                </button>

                {/* Список досрочных платежей */}
                {extras.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t.extraPaymentsTitle}</p>
                    {extras.map(ex => {
                      const [y, m] = ex.date.split("-");
                      return (
                        <div key={ex.id} className="flex items-center justify-between rounded-xl px-3 py-2"
                          style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
                          <div className="flex items-center gap-2">
                            <Icon name="ArrowDownCircle" size={14} className="text-green-400" />
                            <span className="text-xs text-foreground">{t.monthsShort[parseInt(m) - 1]} {y}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {ex.mode === "reducePayment" ? t.extraPaymentReducePayment : t.extraPaymentReduceTerm}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-green-400">−{fmt(ex.amount)}</span>
                            <button onClick={() => removeExtra(ex.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                              <Icon name="X" size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* График */}
                <button onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                  className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <span>{t.paymentSchedule}</span>
                  <Icon name={isExpanded ? "ChevronUp" : "ChevronDown"} size={14} />
                </button>

                {isExpanded && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {sched.rows.map(row => {
                      const [y, m] = row.month.split("-");
                      const isPaid = loan.paidMonths.includes(row.month);
                      return (
                        <button key={row.month} onClick={() => togglePaid(row.month)}
                          className="w-full flex items-center justify-between rounded-xl px-3 py-2 transition-all text-left"
                          style={{ background: isPaid ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.03)", border: isPaid ? "1px solid rgba(34,197,94,0.2)" : "1px solid transparent" }}>
                          <span className="text-xs text-muted-foreground">{t.monthsShort[parseInt(m) - 1]} {y}</span>
                          <div className="flex items-center gap-2">
                            {row.extra > 0 && <span className="text-[10px] text-green-400">+{fmt(row.extra)}</span>}
                            <span className="text-xs font-medium" style={{ color: isPaid ? "#4ade80" : "#7dd3fc" }}>{fmt(row.payment)}</span>
                            {isPaid
                              ? <Icon name="CheckCircle2" size={14} className="text-green-400" />
                              : <Icon name="Circle" size={14} className="text-muted-foreground" />
                            }
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button onClick={deleteLoan} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors">
                  <Icon name="Trash2" size={11} />
                  {t.delete}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onAddNew}
        className={`mt-4 w-full py-3 rounded-2xl glass border border-dashed ${dir === "lent" ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" : "border-sky-500/30 text-sky-400 hover:bg-sky-500/10"} transition-all duration-200 font-medium flex items-center justify-center gap-2`}
      >
        <Icon name="Plus" size={16} />
        {dir === "lent" ? t.addLent : t.addBorrowed}
      </button>

      {extraLoan && onPersonalLoanUpdate && (
        <ExtraPaymentModal
          loan={extraLoan}
          onClose={() => setExtraLoan(null)}
          onSave={(updated) => {
            onPersonalLoanUpdate(personalLoans.map(l => l.id === updated.id ? updated : l));
            const last = (updated.extraPayments || [])[updated.extraPayments!.length - 1];
            if (last) {
              showToast(`Досрочный платёж ${last.amount.toLocaleString("ru-RU")} ₽ внесён`/* TODO: i18n */);
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[70] pointer-events-none animate-fade-in"
          style={{ bottom: "100px" }}>
          <div className="glass rounded-2xl px-4 py-3 flex items-center gap-2 shadow-2xl"
            style={{ border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.12)" }}>
            <Icon name="CheckCircle2" size={18} className="text-green-400" />
            <span className="text-sm font-medium text-foreground">{toast}</span>
          </div>
        </div>
      )}

      {confirmReturn && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 animate-fade-in"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setConfirmReturn(null)}>
          <div className="glass rounded-2xl p-5 w-full max-w-sm space-y-3"
            style={{ border: "1px solid rgba(34,197,94,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(34,197,94,0.15)" }}>
                <Icon name="CheckCircle2" size={20} style={{ color: "#4ade80" }} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Подтвердить возврат долга?{/* TODO: i18n */}</p>
                <p className="text-xs text-muted-foreground truncate">
                  «{confirmReturn.name}» · {fmt(confirmReturn.interestRate ? calcTotalWithInterest(confirmReturn.amount, confirmReturn.interestRate, confirmReturn.interestType || "simple", confirmReturn.dueDate) : confirmReturn.amount)}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-center text-muted-foreground">Отменить это действие будет нельзя{/* TODO: i18n */}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReturn(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-muted-foreground"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {t.cancel}
              </button>
              <button onClick={() => { if (confirmReturn.debtDbId) markPaidWithFeedback(confirmReturn.debtDbId); setConfirmReturn(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Calendar ────────────────────────────────────────────────────────
type CalendarRental = { id: string; title: string; amount: number; payment_day: number; landlord_user_id?: number; tenant_user_id?: number; landlord_name?: string; tenant_name?: string; status: string };

export function CalendarSection({ contacts, t, debts, rentals = [], userId = 0, locale = "ru", token, onNav, onOpenChat, onMarkPaid, onPaymentAccepted }: { contacts: Contact[]; t: ReturnType<typeof getT>; debts: Debt[]; rentals?: CalendarRental[]; userId?: number; locale?: string; token?: string; onNav?: (s: Section) => void; onOpenChat?: (debtId: string, title: string) => void; onMarkPaid?: (debtId: string) => void; onPaymentAccepted?: (debtId: string, newAmount: number, fullyPaid: boolean) => void }) {
  const [calDate, setCalDate] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const daysInMonth = new Date(calDate.year, calDate.month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(calDate.year, calDate.month, 1).getDay() + 6) % 7;
  const todayRef = new Date();
  const isCurrentMonth = todayRef.getFullYear() === calDate.year && todayRef.getMonth() === calDate.month;
  const todayDay = isCurrentMonth ? todayRef.getDate() : -1;
  const monthName = t.months[calDate.month] + " " + calDate.year;

  // Точки на календаре: долги (фиолетовые/цветные) + аренда (бирюзовые)
  const dayColors: Record<number, string[]> = {};
  debts.forEach(d => {
    if (!d.dueDate) return;
    const dd = new Date(d.dueDate);
    if (dd.getFullYear() === calDate.year && dd.getMonth() === calDate.month) {
      const contact = contacts.find(c => c.id === d.contactId);
      const hex = contact ? getColor(contact.color).hex : "#a855f7";
      if (!dayColors[dd.getDate()]) dayColors[dd.getDate()] = [];
      dayColors[dd.getDate()].push(hex);
    }
  });
  const activeRentals = rentals.filter(r => r.status === "active");
  activeRentals.forEach(r => {
    const day = r.payment_day;
    if (day >= 1 && day <= daysInMonth) {
      if (!dayColors[day]) dayColors[day] = [];
      const isLandlord = r.landlord_user_id === userId;
      dayColors[day].push(isLandlord ? "#c084fc" : "#7dd3fc");
    }
  });

  // Список событий месяца: долги + платежи аренды
  const upcomingDebts = debts
    .filter(d => { if (!d.dueDate) return false; const dd = new Date(d.dueDate); return dd.getFullYear() === calDate.year && dd.getMonth() === calDate.month; })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const rentalEvents = activeRentals
    .filter(r => r.payment_day >= 1 && r.payment_day <= daysInMonth)
    .sort((a, b) => a.payment_day - b.payment_day);

  const hasEvents = upcomingDebts.length > 0 || rentalEvents.length > 0;

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

        {/* Легенда */}
        {(upcomingDebts.length > 0 || rentalEvents.length > 0) && (
          <div className="flex gap-3 mb-3 flex-wrap">
            {upcomingDebts.length > 0 && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#a855f7" }} />{t.legendLoans}</span>}
            {rentalEvents.some(r => r.landlord_user_id === userId) && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#c084fc" }} />{t.rentalLandlord}</span>}
            {rentalEvents.some(r => r.tenant_user_id === userId) && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#7dd3fc" }} />{t.legendRental}</span>}
          </div>
        )}

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
        {!hasEvents && (
          <div className="glass rounded-2xl p-6 flex flex-col items-center text-center gap-2">
            <Icon name="CalendarDays" size={28} className="text-purple-400 opacity-50" />
            <p className="text-sm text-muted-foreground">{t.noDebtsThisMonth}</p>
          </div>
        )}

        {/* Долги */}
        {upcomingDebts.map((d, i) => {
          const contact = contacts.find(c => c.id === d.contactId);
          const col = contact ? getColor(contact.color) : getColor("purple");
          const dd = new Date(d.dueDate);
          return (
            <button key={i} type="button" onClick={() => setSelectedDebt(d)} className="w-full text-left glass rounded-2xl p-4 flex items-center gap-3 hover:bg-white/[0.06] active:scale-[0.99] transition" style={{ borderLeft: `3px solid ${col.hex}` }}>
              <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                <span className="text-base font-bold text-foreground leading-none">{dd.getDate()}</span>
                <span className="text-[9px] text-muted-foreground">{t.months[dd.getMonth()]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.hex }} />
                  <p className="font-medium text-foreground truncate">{d.name}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {d.archivedDir === "lent" ? "Выданный займ" : "Мой займ"}{(contact?.name || d.counterpartyName) ? ` • ${contact?.name || d.counterpartyName}` : ""}
                </p>
              </div>
              <div className="font-bold font-heading text-base flex-shrink-0" style={{ color: col.text }}>
                {fmt(d.amount)}
              </div>
            </button>
          );
        })}

        {/* Платежи аренды */}
        {rentalEvents.map((r, i) => {
          const isLandlord = r.landlord_user_id === userId;
          const color = isLandlord ? "#c084fc" : "#7dd3fc";
          const bg = isLandlord ? "rgba(192,132,252,0.12)" : "rgba(125,211,252,0.12)";
          const border = isLandlord ? "rgba(192,132,252,0.25)" : "rgba(125,211,252,0.25)";
          return (
            <button key={`rent-${i}`} type="button" onClick={() => onNav?.("rental")} className="w-full text-left glass rounded-2xl p-4 flex items-center gap-3 hover:bg-white/[0.06] active:scale-[0.99] transition" style={{ borderLeft: `3px solid ${color}` }}>
              <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <span className="text-base font-bold leading-none" style={{ color }}>{r.payment_day}</span>
                <span className="text-[9px] text-muted-foreground">{t.months[calDate.month]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon name={isLandlord ? "KeyRound" : "Home"} size={12} style={{ color }} />
                  <p className="font-medium text-foreground truncate">{r.title}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  Аренда{(isLandlord ? r.tenant_name : r.landlord_name) ? ` • ${isLandlord ? r.tenant_name : r.landlord_name}` : ""}
                </p>
              </div>
              <div className="font-bold font-heading text-base flex-shrink-0" style={{ color }}>
                {fmt(r.amount)}
              </div>
            </button>
          );
        })}
      </div>
      <DebtDetailModal
        debt={selectedDebt}
        dir={selectedDebt?.archivedDir === "borrowed" ? "borrowed" : "lent"}
        locale={locale}
        onClose={() => setSelectedDebt(null)}
        onOpenChat={onOpenChat}
        onMarkPaid={onMarkPaid}
        token={token}
        userId={userId}
        onPaymentAccepted={onPaymentAccepted}
        contactInfo={selectedDebt ? (() => { const c = contacts.find(x => x.id === selectedDebt.contactId); return c ? { name: c.name, phone: c.phone, email: c.email, telegram: c.telegram } : undefined; })() : undefined}
      />
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────
export function NotificationsSection({ notifs, onMarkAllRead, onMarkRead, t, token = "", onOpenChat, onOpenSupport, onPaymentAccepted, contacts = [], allDebts = [] }: {
  notifs: Notification[];
  onMarkAllRead: () => void;
  onMarkRead: (id: number) => void;
  t: ReturnType<typeof getT>;
  token?: string;
  onOpenChat?: (debtId: string | undefined, rentalId: number | undefined, title: string) => void;
  onOpenSupport?: (ticketId: number) => void;
  onPaymentAccepted?: (debtId: string, newAmount: number, fullyPaid: boolean) => void;
  contacts?: Contact[];
  allDebts?: Debt[];
}) {
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [decidingPay, setDecidingPay] = useState<number | null>(null);
  const [decidedPay, setDecidedPay] = useState<Record<number, "accepted" | "rejected">>({});
  const [decidingTopUp, setDecidingTopUp] = useState<number | null>(null);
  const [decidedTopUp, setDecidedTopUp] = useState<Record<number, "accepted" | "rejected">>({});
  // Скрытые треды (локально) — объявлены тут, чтобы можно было считать unread без них
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("df-hidden-threads") || "[]"); } catch { return []; }
  });
  const [confirmDel, setConfirmDel] = useState<{ key: string; title: string } | null>(null);

  function threadKey(n: Notification): string | null {
    if (n.chatMeta) return `chat:${n.chatMeta.debtId || ""}:${n.chatMeta.rentalId || ""}`;
    if (n.supportMeta) return `support:${n.supportMeta.ticketId}`;
    return null;
  }

  // Считаем только непрочитанные, которые юзер реально увидит в списке
  const unread = notifs.filter(n => {
    if (n.read) return false;
    const k = threadKey(n);
    if (k && hiddenKeys.includes(k)) return false;
    return true;
  }).length;

  async function decidePayment(n: Notification, decision: "accepted" | "rejected") {
    if (!n.paymentRequestMeta) return;
    setDecidingPay(n.id);
    try {
      const urls = (await import("../../../backend/func2url.json")).default;
      const res = await fetch(`${urls["debts"]}?action=pay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payment_request_id: n.paymentRequestMeta.paymentRequestId, decision }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setDecidedPay(prev => ({ ...prev, [n.id]: decision }));
        onMarkRead(n.id);
        if (decision === "accepted" && onPaymentAccepted && n.paymentRequestMeta) {
          onPaymentAccepted(
            n.paymentRequestMeta.debtId,
            typeof data.new_amount === "number" ? data.new_amount : 0,
            Boolean(data.fully_paid),
          );
        }
      }
    } finally { setDecidingPay(null); }
  }

  async function decideTopUp(n: Notification, decision: "accepted" | "rejected") {
    if (!n.topUpRequestMeta) return;
    setDecidingTopUp(n.id);
    try {
      const urls = (await import("../../../backend/func2url.json")).default;
      const res = await fetch(`${urls["debts"]}?action=topup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topup_request_id: n.topUpRequestMeta.topUpRequestId, decision }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setDecidedTopUp(prev => ({ ...prev, [n.id]: decision }));
        onMarkRead(n.id);
        if (decision === "accepted" && onPaymentAccepted && n.topUpRequestMeta && typeof data.new_amount === "number") {
          onPaymentAccepted(n.topUpRequestMeta.debtId, data.new_amount, false);
        }
      }
    } finally { setDecidingTopUp(null); }
  }

  async function sendReply(n: Notification) {
    const text = (replyText[n.id] || "").trim();
    if (!text) return;
    setSending(n.id);
    try {
      const urls = (await import("../../../backend/func2url.json")).default;
      if (n.supportMeta) {
        const res = await fetch(urls["support"], {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ticket_id: n.supportMeta.ticketId, text }),
        });
        if (res.ok) {
          setReplyText(prev => ({ ...prev, [n.id]: "" }));
          await fetch(urls["support"], {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ticket_id: n.supportMeta.ticketId }),
          });
          onMarkRead(n.id);
        }
      } else if (n.chatMeta) {
        const body: Record<string, unknown> = { text };
        if (n.chatMeta.debtId) body.debt_id = n.chatMeta.debtId;
        if (n.chatMeta.rentalId) body.rental_id = n.chatMeta.rentalId;
        const res = await fetch(urls["chat"], {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setReplyText(prev => ({ ...prev, [n.id]: "" }));
          onMarkRead(n.id);
        }
      }
    } finally { setSending(null); }
  }

  function hideThread(key: string) {
    const next = [...hiddenKeys, key];
    setHiddenKeys(next);
    localStorage.setItem("df-hidden-threads", JSON.stringify(next));
    // помечаем все уведомления треда прочитанными
    notifs.forEach(n => {
      if (threadKey(n) === key && !n.read) onMarkRead(n.id);
    });
    setConfirmDel(null);
  }

  // Группируем чат- и support-уведомления в треды; остальные — оставляем как одиночные
  type Thread = {
    key: string;
    kind: "chat" | "support" | "single";
    title: string;
    subtitle?: string;
    lastNotif: Notification;
    unreadCount: number;
    totalCount: number;
    ts: number;
  };

  const threads: Thread[] = (() => {
    const map = new Map<string, Notification[]>();
    const singles: Notification[] = [];
    for (const n of notifs) {
      const k = threadKey(n);
      if (!k) { singles.push(n); continue; }
      if (hiddenKeys.includes(k)) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    const result: Thread[] = [];
    map.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => b.id - a.id);
      const last = sorted[0];
      const isChat = !!last.chatMeta;
      result.push({
        key,
        kind: isChat ? "chat" : "support",
        title: isChat ? (last.chatMeta!.chatTitle || last.title) : (last.supportMeta!.subject || `Тикет #${last.supportMeta!.ticketId}`),
        subtitle: isChat ? (last.chatMeta!.senderName || "") : `Тикет #${last.supportMeta!.ticketId}`,
        lastNotif: last,
        unreadCount: list.filter(x => !x.read).length,
        totalCount: list.length,
        ts: last.id,
      });
    });
    for (const n of singles) {
      result.push({
        key: `single:${n.id}`,
        kind: "single",
        title: n.title,
        lastNotif: n,
        unreadCount: n.read ? 0 : 1,
        totalCount: 1,
        ts: n.id,
      });
    }
    result.sort((a, b) => b.ts - a.ts);
    return result;
  })();

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
      {threads.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <Icon name="Bell" size={32} className="text-purple-400" />
          <p className="font-semibold text-foreground">{t.noNotifications}</p>
          <p className="text-xs text-muted-foreground">{t.notificationsEmpty}</p>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative glass rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()} style={{ background: "var(--app-bg)" }}>
            <p className="font-semibold text-foreground mb-1">Удалить переписку?</p>
            <p className="text-xs text-muted-foreground mb-4">«{confirmDel.title}» будет скрыта из списка. Это действие нельзя отменить.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 transition-colors">Отмена</button>
              <button onClick={() => hideThread(confirmDel.key)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Треды-чаты */}
      <div className="space-y-2">
        {threads.filter(th => th.kind !== "single").map(th => {
          const n = th.lastNotif;
          const isChat = th.kind === "chat";
          return (
            <div key={th.key} className={`glass rounded-2xl overflow-hidden transition-all ${th.unreadCount > 0 ? "border border-white/10" : ""}`}>
              <div
                className="p-3 flex items-center gap-3 cursor-pointer hover:bg-white/[0.05]"
                onClick={() => {
                  if (isChat && onOpenChat && n.chatMeta) {
                    onOpenChat(n.chatMeta.debtId, n.chatMeta.rentalId, n.chatMeta.chatTitle);
                  } else if (!isChat && onOpenSupport && n.supportMeta) {
                    onOpenSupport(n.supportMeta.ticketId);
                  }
                  notifs.forEach(x => { if (threadKey(x) === th.key && !x.read) onMarkRead(x.id); });
                }}
              >
                {isChat ? (() => {
                  const chatDebtId = n.chatMeta?.debtId;
                  const debtForChat = chatDebtId ? allDebts.find(d => d.debtDbId === chatDebtId) : undefined;
                  const chatContact = debtForChat ? contacts.find(c => c.id === debtForChat.contactId) : (th.subtitle ? contacts.find(c => c.name === th.subtitle) : undefined);
                  const initials = (chatContact?.name || th.subtitle || "?").trim().charAt(0).toUpperCase() || "?";
                  return <Avatar initials={initials} color={chatContact?.color} />;
                })() : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(99,102,241,0.25))" }}>
                    <Icon name="LifeBuoy" size={20} className="text-sky-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-foreground truncate">{th.title}</p>
                    <p className="text-[11px] text-muted-foreground flex-shrink-0">{n.date}</p>
                  </div>
                  {isChat && th.subtitle && (
                    <p className="text-[11px] text-purple-300 truncate mt-0.5">{th.subtitle}</p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-xs truncate ${th.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>{n.message}</p>
                    {th.unreadCount > 0 && (
                      <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold text-white flex items-center justify-center" style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
                        {th.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDel({ key: th.key, title: th.title }); }}
                  className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
                  title="Удалить переписку"
                >
                  <Icon name="Trash2" size={14} style={{ color: "#f87171" }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Обычные уведомления и запросы возврата */}
      <div className="space-y-3 mt-3">
        {threads.filter(th => th.kind === "single").map((th, i) => {
          const n = th.lastNotif;
          const isChat = !!n.chatMeta;
          const isSupport = !!n.supportMeta;
          const isPayReq = !!n.paymentRequestMeta;
          const isTopUpReq = !!n.topUpRequestMeta;
          const isReplyable = isChat || isSupport;
          return (
            <div
              key={n.id}
              className={`glass rounded-2xl overflow-hidden transition-all duration-200 ${!n.read ? "border border-white/10" : "opacity-60"}`}
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              {/* Шапка уведомления */}
              <div
                className={`p-4 flex items-start gap-3 ${!isReplyable ? "cursor-pointer hover:bg-white/[0.06]" : ""}`}
                onClick={() => {
                  if (isReplyable) return;
                  if (n.deepUrl) {
                    const qi = n.deepUrl.indexOf("?");
                    if (qi >= 0) {
                      const params = new URLSearchParams(n.deepUrl.slice(qi));
                      const openDebt = params.get("openDebt");
                      const contract = params.get("contract") === "1";
                      if (openDebt) {
                        window.dispatchEvent(new CustomEvent("open-debt", { detail: { debtDbId: openDebt, openContract: contract } }));
                      }
                    }
                  }
                  onMarkRead(n.id);
                }}
              >
                <NotifIcon type={n.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm text-foreground">{n.title}</p>
                    {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />}
                  </div>
                  {isChat && n.chatMeta && (
                    <p className="text-xs text-muted-foreground mb-0.5">{n.chatMeta.chatTitle}</p>
                  )}
                  {isSupport && n.supportMeta && (
                    <p className="text-xs text-muted-foreground mb-0.5">{/* TODO: i18n */}Тикет #{n.supportMeta.ticketId}</p>
                  )}
                  <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">{n.date}</p>
                </div>
                {isChat && onOpenChat && n.chatMeta && (
                  <button
                    onClick={() => onOpenChat(n.chatMeta!.debtId, n.chatMeta!.rentalId, n.chatMeta!.chatTitle)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all"
                    style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc" }}
                  >
                    {/* TODO: i18n */}Открыть
                  </button>
                )}
                {!isChat && !isSupport && n.deepUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const qi = n.deepUrl!.indexOf("?");
                      if (qi >= 0) {
                        const params = new URLSearchParams(n.deepUrl!.slice(qi));
                        const openDebt = params.get("openDebt");
                        const contract = params.get("contract") === "1";
                        if (openDebt) {
                          window.dispatchEvent(new CustomEvent("open-debt", { detail: { debtDbId: openDebt, openContract: contract } }));
                        }
                      }
                      onMarkRead(n.id);
                    }}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all"
                    style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc" }}
                  >
                    {/* TODO: i18n */}Открыть
                  </button>
                )}
                {isSupport && onOpenSupport && n.supportMeta && (
                  <button
                    onClick={() => { onOpenSupport(n.supportMeta!.ticketId); onMarkRead(n.id); }}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all"
                    style={{ background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)", color: "#7dd3fc" }}
                  >
                    {/* TODO: i18n */}Открыть
                  </button>
                )}
              </div>

              {/* Запрос подтверждения возврата */}
              {isPayReq && n.paymentRequestMeta && (() => {
                const decided = decidedPay[n.id] || (n.paymentRequestMeta.status !== "pending" ? n.paymentRequestMeta.status : null);
                const isLoading = decidingPay === n.id;
                if (decided) {
                  return (
                    <div className="px-4 pb-3 border-t border-white/5">
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <Icon name={decided === "accepted" ? "CheckCircle2" : "XCircle"} size={14} className={decided === "accepted" ? "text-green-400" : "text-red-400"} />
                        <span className={decided === "accepted" ? "text-green-400" : "text-red-400"}>
                          {decided === "accepted" ? "Возврат подтверждён" : "Возврат отклонён"/* TODO: i18n */}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="px-4 pb-3 border-t border-white/5">
                    <div className="mt-3 mb-2 rounded-xl p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">{/* TODO: i18n */}От {n.paymentRequestMeta.fromName || "должника"}</span>
                        <span className="text-[11px] text-muted-foreground">«{n.paymentRequestMeta.debtTitle}»</span>
                      </div>
                      <div className="mt-1.5 text-lg font-bold" style={{ color: "#10b981" }}>
                        {n.paymentRequestMeta.amount.toLocaleString("ru-RU")} ₽
                      </div>
                      {n.paymentRequestMeta.note && (
                        <div className="mt-2 text-[12px] text-foreground/80 italic">
                          «{n.paymentRequestMeta.note}»
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => decidePayment(n, "rejected")}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                      >
                        <Icon name="X" size={13} />
                        {/* TODO: i18n */}Отклонить
                      </button>
                      <button
                        onClick={() => decidePayment(n, "accepted")}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff" }}
                      >
                        {isLoading ? (
                          <Icon name="Loader2" size={13} className="animate-spin" />
                        ) : (
                          <>
                            <Icon name="Check" size={13} />
                            {t.confirm}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Запрос подтверждения доложения долга */}
              {isTopUpReq && n.topUpRequestMeta && (() => {
                const decided = decidedTopUp[n.id] || (n.topUpRequestMeta.status !== "pending" ? n.topUpRequestMeta.status : null);
                const isLoading = decidingTopUp === n.id;
                if (decided) {
                  return (
                    <div className="px-4 pb-3 border-t border-white/5">
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <Icon name={decided === "accepted" ? "CheckCircle2" : "XCircle"} size={14} className={decided === "accepted" ? "text-purple-400" : "text-red-400"} />
                        <span className={decided === "accepted" ? "text-purple-400" : "text-red-400"}>
                          {decided === "accepted" ? "Увеличение принято" : "Увеличение отклонено"}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="px-4 pb-3 border-t border-white/5">
                    <div className="mt-3 mb-2 rounded-xl p-3" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">От {n.topUpRequestMeta.fromName || "кредитора"}</span>
                        <span className="text-[11px] text-muted-foreground">«{n.topUpRequestMeta.debtTitle}»</span>
                      </div>
                      <div className="mt-1.5 text-lg font-bold" style={{ color: "#a855f7" }}>
                        +{n.topUpRequestMeta.amount.toLocaleString("ru-RU")} ₽
                      </div>
                      {n.topUpRequestMeta.note && (
                        <div className="mt-2 text-[12px] text-foreground/80 italic">
                          «{n.topUpRequestMeta.note}»
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => decideTopUp(n, "rejected")}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                      >
                        <Icon name="X" size={13} />
                        Отклонить
                      </button>
                      <button
                        onClick={() => decideTopUp(n, "accepted")}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "#fff" }}
                      >
                        {isLoading ? (
                          <Icon name="Loader2" size={13} className="animate-spin" />
                        ) : (
                          <>
                            <Icon name="Check" size={13} />
                            Подтвердить
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Быстрый ответ для чат- и support-уведомлений */}
              {isReplyable && !n.read && (
                <div className="px-4 pb-3 border-t border-white/5">
                  <div className="flex gap-2 mt-3 items-center">
                    <input
                      value={replyText[n.id] || ""}
                      onChange={e => setReplyText(prev => ({ ...prev, [n.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && sendReply(n)}
                      placeholder="Ответить..."/* TODO: i18n */
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/40 transition-colors"
                    />
                    <button
                      onClick={() => sendReply(n)}
                      disabled={!replyText[n.id]?.trim() || sending === n.id}
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-all"
                      style={{ background: isSupport ? "linear-gradient(135deg, #38bdf8, #6366f1)" : "linear-gradient(135deg, #a855f7, #6366f1)" }}
                    >
                      {sending === n.id
                        ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        : <Icon name="Send" size={13} className="text-white" />
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Archive ─────────────────────────────────────────────────────────
export function ArchiveSection({ contacts, t, locale, archiveDebts, token = "", onOpenChat, onPurgeDebt }: { contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; archiveDebts: Debt[]; token?: string; onOpenChat?: (debtId: string, title: string) => void; onPurgeDebt?: (debtDbId: string) => Promise<void> | void }) {
  const [filter, setFilter] = useState<"returned" | "deleted">("returned");
  const [search, setSearch] = useState("");
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<Debt | null>(null);
  const [purging, setPurging] = useState(false);
  const q = search.trim().toLowerCase();
  const matchSearch = (d: Debt) => {
    if (!q) return true;
    const contact = contacts.find(c => c.id === d.contactId);
    return (
      d.name.toLowerCase().includes(q) ||
      (d.note?.toLowerCase().includes(q) ?? false) ||
      (contact?.name.toLowerCase().includes(q) ?? false) ||
      d.avatar.toLowerCase().includes(q)
    );
  };
  const returnedDebts = archiveDebts.filter(d => d.status !== "deleted" && matchSearch(d));
  const deletedDebts = archiveDebts.filter(d => d.status === "deleted" && matchSearch(d));
  const visible = filter === "returned" ? returnedDebts : deletedDebts;
  const total = visible.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="animate-fade-in">
      <DebtDetailModal
        debt={selectedDebt}
        dir={selectedDebt?.archivedDir || "lent"}
        locale={locale}
        token={token}
        onClose={() => setSelectedDebt(null)}
        onOpenChat={onOpenChat}
      />
      {archiveDebts.length > 0 && (
        <div className="glass rounded-2xl mb-3 flex items-center gap-2 px-3 py-2.5">
          <Icon name="Search" size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.archiveSearchPlaceholder}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="X" size={14} />
            </button>
          )}
        </div>
      )}
      {archiveDebts.length > 0 && (
        <div className="glass rounded-2xl p-1 mb-4 flex gap-1">
          <button
            onClick={() => setFilter("returned")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all"
            style={filter === "returned"
              ? { background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }
              : { color: "rgba(180,180,200,0.7)" }
            }
          >
            <Icon name="CheckCircle2" size={13} />
            {t.archiveReturnedTab}
            <span className="text-[10px] opacity-70">{returnedDebts.length}</span>
          </button>
          <button
            onClick={() => setFilter("deleted")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all"
            style={filter === "deleted"
              ? { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }
              : { color: "rgba(180,180,200,0.7)" }
            }
          >
            <Icon name="Trash2" size={13} />
            {t.archiveDeletedTab}
            <span className="text-[10px] opacity-70">{deletedDebts.length}</span>
          </button>
        </div>
      )}
      {visible.length > 0 && (
        <div className={`glass rounded-2xl p-4 mb-5 ${filter === "returned" ? "bg-green-500/5 border border-green-500/15" : "bg-red-500/5 border border-red-500/15"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${filter === "returned" ? "bg-green-500/20" : "bg-red-500/20"}`}>
              <Icon name={filter === "returned" ? "CheckCircle2" : "Trash2"} size={20} className={filter === "returned" ? "text-green-400" : "text-red-400"} />
            </div>
            <div>
              <p className={`font-semibold ${filter === "returned" ? "text-green-400" : "text-red-400"}`}>
                {filter === "returned" ? `${t.paidOn} ${fmt(total)}` : `Удалено на ${fmt(total)}` /* TODO: i18n */}
              </p>
              <p className="text-xs text-muted-foreground">{visible.length} {t.completedTx}</p>
            </div>
          </div>
        </div>
      )}
      {visible.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3">
          <Icon name={q ? "SearchX" : filter === "returned" ? "Archive" : "Trash2"} size={32} className="text-purple-400 opacity-50" />
          <p className="font-semibold text-foreground">
            {q ? "Ничего не найдено" /* TODO: i18n */ : filter === "returned" ? t.archiveEmpty : "Удалённых займов нет" /* TODO: i18n */}
          </p>
          <p className="text-xs text-muted-foreground">
            {q ? `Нет совпадений по запросу «${search}»` /* TODO: i18n */ : filter === "returned" ? t.archiveEmptyDesc : "Здесь появятся займы, удалённые кредитором" /* TODO: i18n */}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {visible.map((d, i) => {
          const contact = contacts.find(c => c.id === d.contactId);
          const isDeleted = d.status === "deleted";
          return (
            <div
              key={d.id}
              onClick={() => setSelectedDebt(d)}
              className="glass rounded-2xl p-4 flex items-center gap-4 opacity-80 hover:opacity-100 hover:bg-white/[0.06] transition-all cursor-pointer active:scale-[0.99]"
              style={{ animationDelay: `${i * 0.05}s`, borderLeft: isDeleted ? "3px solid #f87171" : undefined }}
            >
              <Avatar initials={d.avatar} color={contact?.color} imageUrl={d.counterpartyAvatarUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-semibold truncate ${isDeleted ? "text-muted-foreground line-through" : "text-foreground"}`}>{d.name}</p>
                </div>
                {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {d.dueDate
                    ? new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
                    : "Бессрочно"}
                </p>
              </div>
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                <p className={`text-lg font-bold font-heading ${isDeleted ? "text-muted-foreground line-through" : "text-green-400"}`}>{fmt(d.amount)}</p>
                {isDeleted ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                    <Icon name="Trash2" size={10} />
                    {/* TODO: i18n */}Удалён
                  </span>
                ) : (
                  <StatusBadge status="paid" t={t} />
                )}
              </div>
              {isDeleted && onPurgeDebt && d.debtDbId && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmPurge(d); }}
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
                  title="Удалить навсегда"
                  aria-label="Удалить навсегда"
                >
                  <Icon name="Trash2" size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {confirmPurge && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={purging ? undefined : () => setConfirmPurge(null)} />
          <div className="relative w-full max-w-sm rounded-3xl overflow-hidden animate-fade-in border border-white/10 shadow-2xl" style={{ background: "#1a1d2e" }}>
            <div className="p-5 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                <Icon name="Trash2" size={26} className="text-red-400" />
              </div>
              <p className="font-semibold text-foreground text-lg">Удалить навсегда?</p>
              <p className="text-sm text-muted-foreground">
                «{confirmPurge.name}» — {fmt(confirmPurge.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                Запись будет стёрта без возможности восстановления.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setConfirmPurge(null)}
                disabled={purging}
                className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={async () => {
                  if (!confirmPurge.debtDbId || !onPurgeDebt) return;
                  setPurging(true);
                  try {
                    await onPurgeDebt(confirmPurge.debtDbId);
                    setConfirmPurge(null);
                  } finally {
                    setPurging(false);
                  }
                }}
                disabled={purging}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold text-sm shadow-lg shadow-red-500/20 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {purging ? <Icon name="Loader2" size={16} className="animate-spin" /> : <><Icon name="Trash2" size={16} />Удалить навсегда</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Contacts ────────────────────────────────────────────────────────
export function ContactsSection({
  contacts,
  onAddContact,
  onSelectContact,
  onImportFromPhonebook,
  t,
}: {
  contacts: Contact[];
  onAddContact: () => void;
  onSelectContact: (c: Contact) => void;
  onImportFromPhonebook: () => void;
  t: ReturnType<typeof getT>;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.telegram || "").toLowerCase().includes(q),
      )
    : contacts;

  return (
    <div className="animate-fade-in">
      {contacts.length > 0 && (
        <div className="mb-3 relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск контактов..."
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-purple-500/50 outline-none text-foreground text-sm"
          />
        </div>
      )}

      {contacts.length === 0 && (
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-3 mb-4">
          <Icon name="Users" size={32} className="text-purple-400 opacity-50" />
          <p className="font-semibold text-foreground">{t.noContacts}</p>
          <p className="text-xs text-muted-foreground">{t.contactsHint}</p>
        </div>
      )}

      {contacts.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl p-6 text-center text-sm text-muted-foreground bg-white/5 border border-white/10 mb-3">
          Ничего не найдено
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((c, i) => {
          const col = getColor(c.color);
          return (
            <button
              key={c.id}
              onClick={() => onSelectContact(c)}
              className="w-full text-left glass rounded-2xl p-4 transition-all duration-200 hover:bg-white/[0.07]"
              style={{ animationDelay: `${i * 0.05}s`, borderLeft: `3px solid ${col.hex}` }}
            >
              <div className="flex items-center gap-4 mb-2">
                <Avatar initials={c.avatar} color={c.color} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{c.name}</p>
                  {c.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Icon name="Phone" size={11} />{c.phone}
                    </p>
                  )}
                  {c.telegram && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Icon name="Send" size={11} />@{c.telegram}
                    </p>
                  )}
                </div>
                <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
              </div>
              {(c.totalLent > 0 || c.totalBorrowed > 0) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
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
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onAddContact}
        className="mt-4 w-full py-3 rounded-2xl glass border border-dashed border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all duration-200 font-medium flex items-center justify-center gap-2"
      >
        <Icon name="UserPlus" size={16} />
        {t.addContact}
      </button>

      <button
        onClick={onImportFromPhonebook}
        className="mt-2 w-full py-3 rounded-2xl glass border border-dashed border-white/10 text-muted-foreground hover:bg-white/5 transition-all duration-200 font-medium flex items-center justify-center gap-2 text-sm"
      >
        <Icon name="Download" size={14} />
        Импорт из телефонной книги
      </button>
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────
export function Dashboard({ onNav, contacts, t, lentDebts, borrowedDebts, activeRentalCount = 0, totalRentalAmount = 0, personalLoans = [], onOpenReport }: { onNav: (s: Section) => void; contacts: Contact[]; t: ReturnType<typeof getT>; lentDebts: Debt[]; borrowedDebts: Debt[]; activeRentalCount?: number; totalRentalAmount?: number; personalLoans?: PersonalLoan[]; onOpenReport?: () => void }) {
  const totalLent = lentDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0);
  const personalRemaining = personalLoans.reduce((s, l) => {
    const monthsTotal = Math.max(1, Math.round((new Date(l.dueDate + "-01").getTime() - new Date(l.startDate + "-01").getTime()) / (30 * 86400000)) + 1);
    const paid = (l.paidMonths?.length || 0) * l.monthlyPayment;
    const fullTotal = l.monthlyPayment * monthsTotal;
    return s + Math.max(0, fullTotal - paid);
  }, 0);
  const activePersonalLoans = personalLoans.filter(l => {
    const monthsTotal = Math.max(1, Math.round((new Date(l.dueDate + "-01").getTime() - new Date(l.startDate + "-01").getTime()) / (30 * 86400000)) + 1);
    return (l.paidMonths?.length || 0) < monthsTotal;
  }).length;
  const totalBorrowed = borrowedDebts.filter(d => d.status !== "paid").reduce((s, d) => s + d.amount, 0) + personalRemaining;
  const borrowedActiveCount = borrowedDebts.filter(d => d.status !== "paid").length + activePersonalLoans;
  const balance = totalLent - totalBorrowed;
  const lentOverdueCount = lentDebts.filter(d => d.status === "overdue").length;
  const borrowedOverdueCount = borrowedDebts.filter(d => d.status === "overdue").length;
  const overdueCount = lentOverdueCount + borrowedOverdueCount;
  // Открыть раздел с просроченными: если все в одной стороне — туда; иначе в "взято" по умолчанию
  function openOverdue() {
    const target: Section = lentOverdueCount > 0 && borrowedOverdueCount === 0 ? "lent" : "borrowed";
    onNav(target);
    // Применяем фильтр после рендера секции
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("set-debt-filter", { detail: { dir: target, filter: "overdue" } }));
    }, 30);
  }
  // На lent (я кредитор) ждёт моего действия — подтвердить возврат
  const lentPendingCount = lentDebts.reduce((s, d) => s + (d.pendingPaymentsCount || 0), 0);
  // На borrowed (я должник) ждёт моего действия — ответить на изменение суммы
  const borrowedPendingCount = borrowedDebts.reduce((s, d) => s + (d.pendingTopUpsCount || 0), 0);
  const allDebts = [...lentDebts, ...borrowedDebts];
  const isEmpty = allDebts.length === 0 && personalLoans.length === 0;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {/* Баланс */}
        <button
          onClick={onOpenReport}
          disabled={!onOpenReport}
          className="relative rounded-3xl overflow-hidden p-4 text-left hover:opacity-90 transition-all active:scale-[0.98] disabled:cursor-default"
          style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(99,102,241,0.2) 50%, rgba(56,189,248,0.2) 100%)", border: "1px solid rgba(168,85,247,0.3)" }}
        >
          <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 50%, rgba(168,85,247,0.5), transparent 60%)" }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <p className="text-muted-foreground text-xs">{t.totalBalance}</p>
              {onOpenReport && <Icon name="BarChart3" size={12} className="text-muted-foreground opacity-70" />}
            </div>
            <p className={`text-2xl font-black font-heading mb-0.5 ${balance >= 0 ? "text-gradient-purple" : "text-red-400"}`}>
              {balance >= 0 ? "+" : ""}{fmt(balance)}
            </p>
            <p className="text-[10px] text-muted-foreground">{balance >= 0 ? t.youAreOwed : t.youOweTotal}</p>
          </div>
        </button>

        {/* Аренда */}
        <button onClick={() => onNav("rental")} className="relative rounded-3xl overflow-hidden p-4 text-left hover:opacity-90 transition-all" style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.25) 0%, rgba(6,148,162,0.15) 100%)", border: "1px solid rgba(20,184,166,0.35)" }}>
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 30% 50%, rgba(20,184,166,0.6), transparent 60%)" }} />
          <div className="relative">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="Home" size={12} style={{ color: "#5eead4" }} />
              <p className="text-[10px] text-muted-foreground">{t.titleRental}</p>
            </div>
            <p className="text-xl font-black font-heading mb-0.5" style={{ color: "#5eead4" }}>
              {activeRentalCount}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {activeRentalCount === 0 ? "нет аренд" /* TODO: i18n */ : `${fmt(totalRentalAmount)}/мес` /* TODO: i18n */}
            </p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNav("lent")} className={`relative glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 ${lentPendingCount > 0 ? "pending-green-pulse" : "glow-purple"}`}>
          {lentPendingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shadow-lg animate-pulse" style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 0 12px rgba(16,185,129,0.6)" }}>
              {lentPendingCount}
            </span>
          )}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-purple rounded-xl flex items-center justify-center"><Icon name="TrendingUp" size={16} className="text-white" /></div>
            <span className="text-xs text-muted-foreground">{t.navLent}</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-purple">{fmt(totalLent)}</p>
          <p className="text-xs text-muted-foreground mt-1">{lentDebts.filter(d => d.status !== "paid").length} {t.activeDebts.toLowerCase()}</p>
        </button>

        <button onClick={() => onNav("borrowed")} className={`relative glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 ${borrowedPendingCount > 0 ? "pending-green-pulse" : "glow-blue"}`}>
          {borrowedPendingCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shadow-lg animate-pulse" style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 0 12px rgba(16,185,129,0.6)" }}>
              {borrowedPendingCount}
            </span>
          )}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 gradient-blue rounded-xl flex items-center justify-center"><Icon name="TrendingDown" size={16} className="text-white" /></div>
            <span className="text-xs text-muted-foreground">{t.navBorrowed}</span>
          </div>
          <p className="text-2xl font-black font-heading text-gradient-blue">{fmt(totalBorrowed)}</p>
          <p className="text-xs text-muted-foreground mt-1">{borrowedActiveCount} {t.activeDebts.toLowerCase()}</p>
        </button>

        <button onClick={openOverdue} disabled={overdueCount === 0} className="glass rounded-2xl p-4 text-left hover:bg-white/[0.07] transition-all duration-200 disabled:cursor-default disabled:opacity-60">
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
              <p className="font-semibold text-foreground mb-1">{/* TODO: i18n */}Долгов пока нет</p>
              <p className="text-xs text-muted-foreground">{t.emptyDebtsHint}</p>
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
export function SettingsSection({ theme, onThemeChange, profile, onProfileChange, t, lang, onLangChange, onLogout, isDemo, onOpenSupport, token, authUrl }: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  profile: { name: string; phone: string; email: string; avatarUrl?: string };
  onProfileChange: (p: { name: string; phone: string; email: string; avatarUrl?: string }) => void;
  t: ReturnType<typeof getT>;
  lang: Lang;
  onLangChange: (l: Lang) => void;
  onLogout: () => void;
  isDemo?: boolean;
  onOpenSupport?: () => void;
  token?: string;
  authUrl?: string;
}) {
  const [local, setLocal] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("df-sound-notif") !== "off");
  const [pushStatus, setPushStatus] = useState<"granted" | "denied" | "default" | "unsupported" | "loading">("loading");
  const [pushSubbed, setPushSubbed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const isAdmin = (profile.phone || "").replace(/\D/g, "").endsWith("9680066666");
  const inviteUrl = (() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const phone = (profile.phone || "").replace(/\D/g, "");
    return phone ? `${origin}/?ref=${phone}` : origin || "";
  })();

  useEffect(() => {
    (async () => {
      const st = await getPushStatus();
      setPushStatus(st);
      if (st === "granted") setPushSubbed(await isSubscribedToPush());
    })();
  }, []);

  async function togglePush() {
    if (!token) return;
    setPushBusy(true);
    try {
      if (pushSubbed) {
        await unsubscribeFromPush(token);
        setPushSubbed(false);
      } else {
        const res = await ensurePushSubscription(token);
        setPushStatus(res === "error" ? "default" : res);
        setPushSubbed(res === "granted");
      }
    } finally {
      setPushBusy(false);
    }
  }

  const [testPushBusy, setTestPushBusy] = useState(false);
  const [testPushMsg, setTestPushMsg] = useState<string | null>(null);
  async function sendTestPush() {
    if (!token) return;
    setTestPushBusy(true);
    setTestPushMsg(null);
    try {
      await ensurePushSubscription(token, { silent: true });
      const { default: urls } = await import("../../../backend/func2url.json");
      const chatUrl = (urls as Record<string, string>)["chat"];
      const r = await fetch(`${chatUrl}?action=test-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.ok) {
        setTestPushMsg(`Отправлено на ${data.subs} устр.`);
      } else {
        setTestPushMsg(data.error || "Не удалось");
      }
    } catch {
      setTestPushMsg("Сеть недоступна");
    } finally {
      setTestPushBusy(false);
      setTimeout(() => setTestPushMsg(null), 5000);
    }
  }

  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showInstallApp, setShowInstallApp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const installPlatform: "ios" | "android" | "desktop" = (() => {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    if (/android/i.test(ua)) return "android";
    return "desktop";
  })();
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) setIsAppInstalled(true);
      if ((window.navigator as { standalone?: boolean }).standalone) setIsAppInstalled(true);
    } catch { /* ignore */ }
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  async function triggerNativeInstall() {
    if (!installPrompt) return false;
    try {
      const p = installPrompt as { prompt: () => void; userChoice: Promise<{ outcome: string }> };
      p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome === "accepted") {
        try { localStorage.setItem("dd_install_banner_dismissed_at", String(Date.now())); } catch { /* ignore */ }
        setIsAppInstalled(true);
        setShowInstallApp(false);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }
  const [diagReport, setDiagReport] = useState<string | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  async function fullResetPush() {
    if (!token || resetBusy) return;
    setResetBusy(true);
    setResetMsg(null);
    try {
      await hardResetPush(token);
      const status = await ensurePushSubscription(token, { silent: false });
      if (status === "granted") {
        setPushStatus("granted");
        setPushSubbed(true);
        setResetMsg("Готово! Подписка пересоздана");
      } else {
        const reason = getLastPushError();
        setResetMsg(reason ? `Ошибка: ${reason}` : `Не удалось (${status})`);
      }
    } catch (e) {
      setResetMsg(`Ошибка: ${(e as Error).message}`.slice(0, 120));
    } finally {
      setResetBusy(false);
      setTimeout(() => setResetMsg(null), 12000);
    }
  }
  async function runDiagnostics() {
    setDiagBusy(true);
    const lines: string[] = [];
    try {
      lines.push("1. SW: " + ("serviceWorker" in navigator ? "OK" : "НЕТ"));
      lines.push("2. PushManager: " + ("PushManager" in window ? "OK" : "НЕТ"));
      lines.push("3. Notification: " + ("Notification" in window ? "OK" : "НЕТ"));
      lines.push("4. Permission: " + (typeof Notification !== "undefined" ? Notification.permission : "?"));
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      lines.push("5. Standalone (PWA): " + (standalone ? "ДА" : "НЕТ — открой через ярлык!"));

      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        lines.push("6. SW active: " + (reg.active ? "OK" : "НЕТ"));
        lines.push("7. SW scope: " + reg.scope);
        const sub = await reg.pushManager.getSubscription();
        lines.push("8. Subscription: " + (sub ? "ЕСТЬ" : "НЕТ"));
        if (sub) {
          lines.push("9. Endpoint host: " + new URL(sub.endpoint).host);
        }
        // Локальный тест — без сервера, прямо из SW
        try {
          await reg.showNotification("Локальный тест", {
            body: "Если ты видишь это — баннер работает. Проблема в push-сервере.",
            icon: "https://cdn.poehali.dev/projects/31787416-6a3a-4698-9696-0e05341c75e7/files/3c85fb56-a239-44e8-94ff-1f08ccc35bb7.jpg",
            tag: "diag-" + Date.now(),
            requireInteraction: false,
          });
          lines.push("10. Локальный showNotification: ВЫЗВАН");
        } catch (e) {
          lines.push("10. Локальный showNotification: ОШИБКА " + (e as Error).message);
        }
      }

      lines.push("11. UA: " + navigator.userAgent.slice(0, 80));
    } catch (e) {
      lines.push("ERR: " + (e as Error).message);
    } finally {
      setDiagReport(lines.join("\n"));
      setDiagBusy(false);
    }
  }
  const [deletePin, setDeletePin] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (!token || !authUrl) return;
    if (deletePin.length !== 4) {
      setDeleteError("Введите 4 цифры PIN"/* TODO: i18n */);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch(`${authUrl}?action=delete-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` },
        body: JSON.stringify({ pin: deletePin }),
      });
      const data = await r.json();
      if (!r.ok) {
        setDeleteError(data.error || "Не удалось удалить аккаунт"/* TODO: i18n */);
        setDeleting(false);
        return;
      }
      // Очищаем локальное хранилище и выходим
      localStorage.clear();
      onLogout();
    } catch {
      setDeleteError("Сеть недоступна. Попробуйте ещё раз");
      setDeleting(false);
    }
  }

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

  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarFile(file: File) {
    if (!token || !authUrl) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      setAvatarError("Только JPG, PNG или WebP");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setAvatarError("Файл больше 20 МБ");
      return;
    }
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      // Сжимаем картинку в квадрат 512×512 JPEG, чтобы не упереться в лимит body
      const objectUrl = URL.createObjectURL(file);
      const img: HTMLImageElement = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error("img"));
        im.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("ctx");
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      // Подбираем размер и качество так, чтобы итог ≤ 24 КБ (запас под лимит body провайдера)
      const sizes = [320, 256, 192];
      const qualities = [0.78, 0.65, 0.5];
      let b64 = "";
      outer: for (const sz of sizes) {
        canvas.width = sz; canvas.height = sz;
        ctx.clearRect(0, 0, sz, sz);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, sz, sz);
        for (const q of qualities) {
          const blob: Blob = await new Promise((res, rej) => {
            canvas.toBlob(b => b ? res(b) : rej(new Error("blob")), "image/jpeg", q);
          });
          const dataUrl: string = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result || ""));
            r.onerror = () => rej(new Error("read"));
            r.readAsDataURL(blob);
          });
          const candidate = dataUrl.split(",")[1] || "";
          if (candidate.length <= 24 * 1024) { b64 = candidate; break outer; }
          b64 = candidate;
        }
      }
      URL.revokeObjectURL(objectUrl);
      const { default: urls } = await import("../../../backend/func2url.json");
      const chatUrl = (urls as Record<string, string>)["chat"];
      if (!chatUrl) {
        setAvatarError("Загрузка файлов недоступна");
        setAvatarBusy(false);
        return;
      }
      // 1) Загружаем фото через рабочий чат-аплоадер
      const upRes = await fetch(`${chatUrl}?action=upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          file_base64: b64,
          file_name: `avatar-${Date.now()}.jpg`,
          content_type: "image/jpeg",
        }),
      });
      if (!upRes.ok) {
        const d = await upRes.json().catch(() => ({}));
        setAvatarError(d.error || `Ошибка ${upRes.status}`);
        setAvatarBusy(false);
        return;
      }
      const uploaded = await upRes.json() as { url?: string };
      if (!uploaded.url) {
        setAvatarError("Не получили URL фото");
        setAvatarBusy(false);
        return;
      }
      // 2) Сохраняем ссылку в auth
      const saveRes = await fetch(`${authUrl}?action=set-avatar-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatar_url: uploaded.url }),
      });
      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({}));
        setAvatarError(d.error || `Ошибка ${saveRes.status}`);
        setAvatarBusy(false);
        return;
      }
      onProfileChange({ ...profile, avatarUrl: uploaded.url });
    } catch (e) {
      setAvatarError(`Не удалось: ${(e as Error).message || "сеть"}`);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarDelete() {
    if (!token || !authUrl) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const r = await fetch(`${authUrl}?action=delete-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` },
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setAvatarError(data.error || "Не удалось удалить");
        setAvatarBusy(false);
        return;
      }
      onProfileChange({ ...profile, avatarUrl: undefined });
    } catch {
      setAvatarError("Сеть недоступна");
    } finally {
      setAvatarBusy(false);
    }
  }
  const [profileError, setProfileError] = useState<string | null>(null);

  async function save() {
    setProfileError(null);
    if (local.email && (!local.email.includes("@") || !local.email.includes("."))) {
      setProfileError("Некорректный email");
      return;
    }
    if (token && authUrl) {
      setSavingProfile(true);
      try {
        const r = await fetch(`${authUrl}?action=update-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Authorization": `Bearer ${token}` },
          body: JSON.stringify({ full_name: local.name, email: local.email }),
        });
        const data = await r.json();
        if (!r.ok) {
          setProfileError(data.error || t.profileSaveError);
          setSavingProfile(false);
          return;
        }
      } catch {
        setProfileError(t.networkUnavailable);
        setSavingProfile(false);
        return;
      }
      setSavingProfile(false);
    }
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
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: "linear-gradient(135deg,#a855f7,#6366f1)" }}>
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                  {(local.name || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase()}
                </div>
              )}
              {avatarBusy && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Icon name="Loader2" size={24} className="text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <label className="flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm font-medium cursor-pointer hover:bg-white/10 transition">
                <Icon name="Camera" size={16} />
                {profile.avatarUrl ? "Сменить фото" : "Загрузить фото"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={avatarBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }}
                />
              </label>
              {profile.avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarDelete}
                  disabled={avatarBusy}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-medium hover:bg-red-500/20 transition disabled:opacity-50"
                >
                  <Icon name="Trash2" size={14} />
                  Удалить
                </button>
              )}
            </div>
          </div>
          {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t.name}</label>
            <input
              value={local.name}
              onChange={e => setLocal(l => ({ ...l, name: e.target.value }))}
              placeholder={t.profilePlaceholderName}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t.phone}</label>
            <input
              value={local.phone}
              readOnly
              disabled
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-muted-foreground outline-none cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input
              value={local.email}
              onChange={e => setLocal(l => ({ ...l, email: e.target.value }))}
              placeholder="example@mail.com"
              type="email"
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          {profileError && (
            <p className="text-xs text-red-400">{profileError}</p>
          )}
          <button
            onClick={save}
            disabled={savingProfile}
            className="w-full py-2.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
          >
            {savingProfile ? "..." : saved ? t.saved : t.save}
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
              <p className="font-semibold text-foreground">{t.soundNotifications}</p>
              <p className="text-xs text-muted-foreground">{soundEnabled ? t.soundOn : t.soundOff}</p>
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

      {/* Push-уведомления */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
            background: pushSubbed && pushStatus === "granted" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.06)"
          }}>
            <Icon name={pushSubbed && pushStatus === "granted" ? "BellRing" : "Bell"} size={18}
              className={pushSubbed && pushStatus === "granted" ? "text-purple-400" : "text-muted-foreground"} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{/* TODO: i18n */}{isAdmin ? "Push-уведомления" : "Уведомления"}</p>
            <p className="text-xs text-muted-foreground">
              {pushStatus === "loading" && "Проверяем настройки…"}
              {pushStatus === "unsupported" && "Браузер не поддерживает push"}
              {pushStatus === "denied" && "Разрешения заблокированы в браузере"}
              {pushStatus === "default" && "Уведомления не включены"}
              {pushStatus === "granted" && pushSubbed && "Включены — придут даже когда приложение закрыто"}
              {pushStatus === "granted" && !pushSubbed && "Разрешение есть, но подписка отключена"}
            </p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{
            background: pushSubbed && pushStatus === "granted" ? "rgba(34,197,94,0.18)" : pushStatus === "denied" ? "rgba(239,68,68,0.18)" : "rgba(148,163,184,0.18)",
            color: pushSubbed && pushStatus === "granted" ? "#4ade80" : pushStatus === "denied" ? "#f87171" : "#94a3b8",
          }}>
            {pushStatus === "loading" ? "..." :
              pushStatus === "unsupported" ? "—" :
              pushStatus === "denied" ? "Заблокированы" :
              pushSubbed && pushStatus === "granted" ? "Включены" : "Выключены"}
          </span>
        </div>

        {pushStatus === "denied" ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Чтобы включить — откройте настройки сайта в браузере и разрешите уведомления вручную.
          </p>
        ) : pushStatus !== "loading" && pushStatus !== "unsupported" && (
          <button
            onClick={togglePush}
            disabled={pushBusy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: pushSubbed && pushStatus === "granted"
                ? "rgba(239,68,68,0.12)" : "linear-gradient(135deg, #a855f7, #6366f1)",
              color: pushSubbed && pushStatus === "granted" ? "#f87171" : "#fff",
              border: pushSubbed && pushStatus === "granted" ? "1px solid rgba(239,68,68,0.3)" : "none",
            }}
          >
            {pushBusy ? (
              <Icon name="Loader2" size={14} className="animate-spin" />
            ) : pushSubbed && pushStatus === "granted" ? (
              <><Icon name="BellOff" size={14} /> Отключить уведомления</>
            ) : (
              <><Icon name="BellRing" size={14} /> Включить уведомления</>
            )}
          </button>
        )}

        {pushStatus === "granted" && pushSubbed && (
          <>
            {typeof window !== "undefined" && !window.matchMedia("(display-mode: standalone)").matches && (
              <div className="mt-2 p-2.5 rounded-xl flex gap-2 items-start" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <Icon name="Info" size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-amber-200 leading-snug">
                  Для надёжной доставки уведомлений установи приложение на главный экран (кнопка «Установить» сверху). Иначе телефон может задерживать push, когда браузер закрыт.
                </p>
              </div>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={sendTestPush}
                  disabled={testPushBusy}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "rgba(168,85,247,0.12)", color: "#c4b5fd", border: "1px solid rgba(168,85,247,0.25)" }}
                >
                  {testPushBusy ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Send" size={12} />}
                  {testPushMsg || "Отправить тестовое уведомление"}
                </button>
                <button
                  onClick={runDiagnostics}
                  disabled={diagBusy}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "rgba(245,158,11,0.10)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}
                >
                  {diagBusy ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="Stethoscope" size={12} />}
                  Диагностика push
                </button>
                <button
                  onClick={fullResetPush}
                  disabled={resetBusy}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "rgba(34,197,94,0.10)", color: "#86efac", border: "1px solid rgba(34,197,94,0.25)" }}
                >
                  {resetBusy ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="RefreshCw" size={12} />}
                  {resetMsg || "Пересоздать подписку"}
                </button>
              </>
            )}
            <button
              onClick={() => setShowAndroidGuide(true)}
              className="mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{ background: "rgba(59,130,246,0.12)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.25)" }}
            >
              <Icon name="Settings2" size={12} />
              Настройки уведомлений Android
            </button>
            {diagReport && (
              <div className="mt-2 p-3 rounded-xl text-[10px] font-mono whitespace-pre-wrap leading-relaxed" style={{ background: "rgba(0,0,0,0.4)", color: "#a7f3d0", border: "1px solid rgba(255,255,255,0.1)" }}>
                {diagReport}
                <button
                  onClick={() => { navigator.clipboard?.writeText(diagReport).catch(() => {}); }}
                  className="mt-2 px-2 py-1 rounded-md text-[10px] font-bold"
                  style={{ background: "rgba(168,85,247,0.2)", color: "#c4b5fd" }}
                >
                  Скопировать
                </button>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              {[
                { icon: "MessageCircle", label: "Сообщения" },
                { icon: "HandCoins", label: "Возвраты" },
                { icon: "CheckCircle2", label: "Подтверждения" },
                { icon: "CalendarClock", label: "Напоминания" },
              ].map(b => (
                <div key={b.label} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)" }}>
                  <Icon name={b.icon} size={11} className="text-purple-400" />
                  <span className="text-foreground/80">{b.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!isAppInstalled && (
        <button
          onClick={async () => {
            if (installPrompt && installPlatform !== "ios") {
              const ok = await triggerNativeInstall();
              if (ok) return;
            }
            setShowInstallApp(true);
          }}
          className="w-full glass rounded-2xl p-5 flex items-center gap-3 hover:bg-white/[0.06] active:scale-[0.99] transition text-left"
        >
          <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon name="Download" size={18} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">Установить приложение</p>
            <p className="text-xs text-muted-foreground">Добавить на главный экран</p>
          </div>
          <Icon name="ChevronRight" size={18} className="text-muted-foreground flex-shrink-0" />
        </button>
      )}

      <button
        onClick={() => setShowInvite(true)}
        className="w-full glass rounded-2xl p-5 flex items-center gap-3 hover:bg-white/[0.06] active:scale-[0.99] transition text-left"
      >
        <div className="w-9 h-9 bg-pink-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon name="UserPlus" size={18} className="text-pink-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">Пригласить друга</p>
          <p className="text-xs text-muted-foreground">Ссылка и QR-код для приглашения</p>
        </div>
        <Icon name="ChevronRight" size={18} className="text-muted-foreground flex-shrink-0" />
      </button>

      <InviteFriendModal open={showInvite} onClose={() => setShowInvite(false)} inviteUrl={inviteUrl} />

      {showInstallApp && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowInstallApp(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl p-5 bg-background border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0">
                <img src="/icons/icon-192.png" alt="Debt-Debt" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-base">Установить Debt-Debt</p>
                <p className="text-xs text-muted-foreground">Работает как обычное приложение</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallApp(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
              >
                <Icon name="X" size={16} />
              </button>
            </div>

            {installPlatform === "ios" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <div className="flex-1 text-sm">Откройте сайт в <b>Safari</b>.</div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <div className="flex-1 text-sm flex items-center gap-2 flex-wrap">
                    Нажмите
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10">
                      <Icon name="Share" size={14} /> Поделиться
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                  <div className="flex-1 text-sm flex items-center gap-2 flex-wrap">
                    Выберите
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10">
                      <Icon name="SquarePlus" size={14} /> На экран «Домой»
                    </span>
                  </div>
                </div>
              </div>
            )}

            {installPlatform === "android" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <div className="flex-1 text-sm">Откройте сайт в <b>Chrome</b>.</div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <div className="flex-1 text-sm flex items-center gap-2 flex-wrap">
                    Нажмите
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10">
                      <Icon name="MoreVertical" size={14} />
                    </span>
                    в правом верхнем углу.
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                  <div className="flex-1 text-sm">Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.</div>
                </div>
              </div>
            )}

            {installPlatform === "desktop" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                  <div className="flex-1 text-sm">В адресной строке Chrome/Edge нажмите иконку
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 ml-1">
                      <Icon name="MonitorDown" size={14} />
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                  <div className="flex-1 text-sm">Нажмите <b>«Установить»</b> — приложение появится на рабочем столе.</div>
                </div>
              </div>
            )}

            {installPrompt && installPlatform !== "ios" ? (
              <button
                type="button"
                onClick={triggerNativeInstall}
                className="mt-5 w-full py-3 rounded-2xl text-white font-semibold"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
              >
                Установить сейчас
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowInstallApp(false)}
                className="mt-5 w-full py-3 rounded-2xl text-white font-semibold"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
              >
                Понятно
              </button>
            )}
          </div>
        </div>
      )}

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
            ...(profile.phone ? [{ label: t.phone, value: profile.phone }] : []),
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-foreground font-medium truncate ml-2 max-w-[180px] text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {profile.phone.replace(/\D/g, "") === "79680066666" && (
        <button
          onClick={() => window.location.href = "/admin"}
          className="w-full py-3 rounded-2xl glass border border-purple-500/20 text-purple-400 hover:bg-purple-500/10 transition-all font-medium flex items-center justify-center gap-2"
        >
          <Icon name="ShieldCheck" size={16} />
          {t.adminPanel}
        </button>
      )}

      {!isDemo && onOpenSupport && (
        <button
          onClick={onOpenSupport}
          className="w-full py-3 rounded-2xl glass border border-sky-500/20 text-sky-400 hover:bg-sky-500/10 transition-all font-medium flex items-center justify-center gap-2"
        >
          <Icon name="LifeBuoy" size={16} />
          {t.support}
        </button>
      )}

      {isDemo ? (
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-2xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
        >
          <Icon name="UserPlus" size={16} className="text-white" />
          {t.register}
        </button>
      ) : (
        <>
          <button
            onClick={onLogout}
            className="w-full py-3 rounded-2xl glass border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all font-medium flex items-center justify-center gap-2"
          >
            <Icon name="LogOut" size={16} />
            {t.signOut}
          </button>

          {token && authUrl && (
            <button
              onClick={() => { setShowDeleteConfirm(true); setDeletePin(""); setDeleteError(null); }}
              className="w-full py-3 rounded-2xl glass border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-all font-medium flex items-center justify-center gap-2"
            >
              <Icon name="UserX" size={16} />
              {t.deleteAccount}
            </button>
          )}
        </>
      )}

      {showAndroidGuide && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => setShowAndroidGuide(false)}
          />
          <div
            className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden animate-fade-in border border-blue-500/30 shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: "#1a1d2e" }}
          >
            <div className="sticky top-0 px-5 py-4 flex items-center justify-between border-b border-white/10" style={{ background: "#1a1d2e" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <Icon name="Settings2" size={20} className="text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Настройки уведомлений</p>
                  <p className="text-[11px] text-muted-foreground">Чтобы баннер появлялся сверху</p>
                </div>
              </div>
              <button onClick={() => setShowAndroidGuide(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl flex gap-2 items-start" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <Icon name="Lightbulb" size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  Звук есть, а баннер не появляется? Это значит, что Android поставил уведомлениям низкий приоритет. Сейчас покажем, что включить.
                </p>
              </div>

              <button
                onClick={() => {
                  const url = "intent://settings/#Intent;scheme=android-app;package=com.android.settings;component=com.android.settings/.Settings$AppNotificationSettingsActivity;end";
                  try { window.location.href = url; } catch (_e) { /* not supported */ }
                }}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 text-white"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
              >
                <Icon name="ExternalLink" size={14} />
                Попробовать открыть настройки
              </button>
              <p className="text-[10px] text-muted-foreground text-center -mt-2">
                Если кнопка не сработает — следуй инструкции ниже
              </p>

              <div className="space-y-3">
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Как сделать вручную</p>

                {[
                  { num: "1", title: "Открой настройки телефона", desc: "Шестерёнка на главном экране или в шторке" },
                  { num: "2", title: "Найди «Приложения»", desc: "Иногда раздел называется «Программы»" },
                  { num: "3", title: "Выбери Chrome или Debt-Debt", desc: "Если установил как PWA — ищи «Debt-Debt». Иначе — «Chrome»" },
                  { num: "4", title: "Нажми «Уведомления»", desc: "Откроется список категорий" },
                  { num: "5", title: "Найди «debt-debt.ru»", desc: "Может быть в подразделе «Сайты»" },
                  { num: "6", title: "Включи «Всплывающие уведомления»", desc: "На Samsung: «Показ всплывающего окна». На Xiaomi: «Плавающие уведомления»" },
                  { num: "7", title: "Поставь важность «Срочные»", desc: "НЕ «Средняя» — иначе баннер не покажется" },
                  { num: "8", title: "Разреши «На экране блокировки»", desc: "Покажи всё содержимое" },
                ].map(step => (
                  <div key={step.num} className="flex gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: "rgba(59,130,246,0.2)", color: "#93c5fd" }}>
                      {step.num}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                <div className="flex items-center gap-2">
                  <Icon name="Smartphone" size={14} className="text-purple-400" />
                  <p className="text-xs font-bold text-purple-300">Для Xiaomi / Redmi / Poco (MIUI)</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Дополнительно: Настройки → Приложения → Управление → Chrome → Автозапуск (включи) → Контроль активности → «Без ограничений»
                </p>
              </div>

              <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <div className="flex items-center gap-2">
                  <Icon name="Smartphone" size={14} className="text-green-400" />
                  <p className="text-xs font-bold text-green-300">Для Samsung (One UI)</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Настройки → Уведомления → Дополнительно → «Показ всплывающих уведомлений» = ВКЛ. Проверь, что «Не беспокоить» выключен.
                </p>
              </div>

              <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="flex items-center gap-2">
                  <Icon name="Smartphone" size={14} className="text-red-400" />
                  <p className="text-xs font-bold text-red-300">Для Huawei / Honor</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Настройки → Приложения → Chrome → Батарея → «Запуск приложения» → выключи все автоматические переключатели и включи вручную.
                </p>
              </div>

              <button
                onClick={() => setShowAndroidGuide(false)}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={deleting ? undefined : () => setShowDeleteConfirm(false)}
          />
          <div
            className="relative w-full max-w-sm rounded-3xl overflow-hidden animate-fade-in border border-red-500/30 shadow-2xl"
            style={{ background: "#1a1d2e" }}
          >
            <div className="p-5 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                <Icon name="TriangleAlert" size={26} className="text-red-400" />
              </div>
              <p className="font-semibold text-foreground text-lg">{t.deleteAccountTitle}</p>
              <p className="text-sm text-muted-foreground">
                {t.deleteAccountDesc}
              </p>
              <p className="text-xs text-red-400 font-medium">
                {t.deleteAccountWarning}
              </p>
              <div className="w-full pt-2">
                <label className="text-xs text-muted-foreground mb-2 block text-left">
                  {t.deleteAccountPinLabel}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={deletePin}
                  onChange={e => { setDeletePin(e.target.value.replace(/\D/g, "").slice(0, 4)); setDeleteError(null); }}
                  placeholder="••••"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] text-foreground outline-none focus:border-red-500/50 transition-colors"
                />
                {deleteError && (
                  <p className="text-xs text-red-400 mt-2 text-center">{deleteError}</p>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deletePin.length !== 4}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-semibold text-sm shadow-lg shadow-red-500/20 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {deleting ? <Icon name="Loader2" size={16} className="animate-spin" /> : <><Icon name="Trash2" size={16} />{t.delete}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PWA Install Banner ───────────────────────────────────────────────────────
export function InstallBanner({ t }: { t: ReturnType<typeof getT> }) {
  const DISMISS_KEY = "dd_install_banner_dismissed_at";
  const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  const [prompt, setPrompt] = useState<Event | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const v = localStorage.getItem(DISMISS_KEY);
      if (!v) return false;
      const ts = Number(v);
      if (!ts) return true;
      return Date.now() - ts < DISMISS_TTL_MS;
    } catch { return false; }
  });
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
  }

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
      if (outcome === 'accepted') dismiss();
    }
  }

  function handleCardClick() {
    if (isIos) setShowIosGuide(true);
    else install();
  }

  return (
    <>
      <div className="relative z-10 px-4 pb-2">
        <div className="max-w-lg mx-auto">
          <div
            role="button"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
            className="rounded-2xl p-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform select-none"
            style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(56,189,248,0.15))", border: "1px solid rgba(168,85,247,0.3)", WebkitTapHighlightColor: "transparent" }}
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
            <div className="flex gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
              {!isIos && (
                <button
                  type="button"
                  onClick={install}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                  style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
                >
                  {t.install}
                </button>
              )}
              {isIos && (
                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                  style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
                >
                  {t.install}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); dismiss(); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
              >
                <Icon name="X" size={14} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showIosGuide && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl p-5 bg-background border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0">
                <img src="/icons/icon-192.png" alt="Debt-Debt" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-base">{t.installApp}</p>
                <p className="text-xs text-muted-foreground">{t.installDesc}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
              >
                <Icon name="X" size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                <div className="flex-1 text-sm">
                  Откройте сайт в <b>Safari</b> (не Chrome).
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                <div className="flex-1 text-sm flex items-center gap-2 flex-wrap">
                  Нажмите кнопку
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10">
                    <Icon name="Share" size={14} />
                    Поделиться
                  </span>
                  внизу экрана.
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                <div className="flex-1 text-sm flex items-center gap-2 flex-wrap">
                  Выберите
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10">
                    <Icon name="SquarePlus" size={14} />
                    На экран «Домой»
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-white/5">
                <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold flex-shrink-0">4</div>
                <div className="flex-1 text-sm">
                  Подтвердите — иконка появится на главном экране.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-5 w-full py-3 rounded-2xl text-white font-semibold"
              style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}