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

export function DebtList({ debts, dir, contacts, t, locale, onOpenChat, onMarkPaid, onDeleteDebt, onAddNew, personalLoans = [], onPersonalLoanUpdate, token = "" }: { debts: Debt[]; dir: "lent" | "borrowed"; contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; onOpenChat?: (debtId: string, title: string) => void; onMarkPaid?: (debtId: string) => void; onDeleteDebt?: (debtId: string) => Promise<void> | void; onAddNew?: () => void; personalLoans?: PersonalLoan[]; onPersonalLoanUpdate?: (loans: PersonalLoan[]) => void; token?: string }) {
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [extraLoan, setExtraLoan] = useState<PersonalLoan | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<Debt | null>(null);
  const [manualReturn, setManualReturn] = useState<Debt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <div className="animate-fade-in">
      <DebtDetailModal
        debt={selectedDebt}
        dir={dir}
        locale={locale}
        onClose={() => setSelectedDebt(null)}
        onOpenChat={onOpenChat}
        onMarkPaid={onMarkPaid ? markPaidWithFeedback : undefined}
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
            <p className="font-semibold text-foreground mb-1">{dir === "lent" ? t.emptyLentTitle : t.emptyBorrowedTitle}</p>
            <p className="text-xs text-muted-foreground">{t.emptyDebtsHint}</p>
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
                className="glass rounded-2xl p-4 flex items-start gap-4 hover:bg-white/[0.06] transition-all duration-200 cursor-pointer group"
                style={{ animationDelay: `${i * 0.05}s`, borderLeft: col ? `3px solid ${col.hex}` : undefined }}
              >
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <Avatar initials={d.avatar} color={contact?.color} />
                  <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 whitespace-nowrap">
                    <Icon name="Calendar" size={10} />
                    {new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground break-words leading-snug">{d.name}</p>
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
type CalendarRental = { id: string; title: string; amount: number; payment_day: number; landlord_user_id?: number; tenant_user_id?: number; status: string };

export function CalendarSection({ contacts, t, debts, rentals = [], userId = 0 }: { contacts: Contact[]; t: ReturnType<typeof getT>; debts: Debt[]; rentals?: CalendarRental[]; userId?: number }) {
  const [calDate, setCalDate] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const daysInMonth = new Date(calDate.year, calDate.month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(calDate.year, calDate.month, 1).getDay() + 6) % 7;
  const todayRef = new Date();
  const isCurrentMonth = todayRef.getFullYear() === calDate.year && todayRef.getMonth() === calDate.month;
  const todayDay = isCurrentMonth ? todayRef.getDate() : -1;
  const monthName = t.months[calDate.month] + " " + calDate.year;

  // Точки на календаре: долги (фиолетовые/цветные) + аренда (бирюзовые)
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
    .filter(d => { const dd = new Date(d.dueDate); return dd.getFullYear() === calDate.year && dd.getMonth() === calDate.month; })
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
            <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3" style={{ borderLeft: `3px solid ${col.hex}` }}>
              <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: col.bg, border: `1px solid ${col.border}` }}>
                <span className="text-base font-bold text-foreground leading-none">{dd.getDate()}</span>
                <span className="text-[9px] text-muted-foreground">{t.months[dd.getMonth()]}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.hex }} />
                  <p className="font-medium text-foreground">{d.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t.eventPay}</p>
              </div>
              <div className="font-bold font-heading text-base flex-shrink-0" style={{ color: col.text }}>
                {fmt(d.amount)}
              </div>
            </div>
          );
        })}

        {/* Платежи аренды */}
        {rentalEvents.map((r, i) => {
          const isLandlord = r.landlord_user_id === userId;
          const color = isLandlord ? "#c084fc" : "#7dd3fc";
          const bg = isLandlord ? "rgba(192,132,252,0.12)" : "rgba(125,211,252,0.12)";
          const border = isLandlord ? "rgba(192,132,252,0.25)" : "rgba(125,211,252,0.25)";
          return (
            <div key={`rent-${i}`} className="glass rounded-2xl p-4 flex items-center gap-3" style={{ borderLeft: `3px solid ${color}` }}>
              <div className="w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: bg, border: `1px solid ${border}` }}>
                <span className="text-base font-bold leading-none" style={{ color }}>{r.payment_day}</span>
                <span className="text-[9px] text-muted-foreground">{t.months[calDate.month]}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Icon name={isLandlord ? "KeyRound" : "Home"} size={12} style={{ color }} />
                  <p className="font-medium text-foreground">{r.title}</p>
                </div>
                <p className="text-xs text-muted-foreground">{isLandlord ? t.receive : t.eventPay}</p>
              </div>
              <div className="font-bold font-heading text-base flex-shrink-0" style={{ color }}>
                {fmt(r.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────
export function NotificationsSection({ notifs, onMarkAllRead, onMarkRead, t, token = "", onOpenChat, onOpenSupport, onPaymentAccepted }: {
  notifs: Notification[];
  onMarkAllRead: () => void;
  onMarkRead: (id: number) => void;
  t: ReturnType<typeof getT>;
  token?: string;
  onOpenChat?: (debtId: string | undefined, rentalId: number | undefined, title: string) => void;
  onOpenSupport?: (ticketId: number) => void;
  onPaymentAccepted?: (debtId: string, newAmount: number, fullyPaid: boolean) => void;
}) {
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<number | null>(null);
  const [decidingPay, setDecidingPay] = useState<number | null>(null);
  const [decidedPay, setDecidedPay] = useState<Record<number, "accepted" | "rejected">>({});
  const unread = notifs.filter(n => !n.read).length;

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

  // Скрытые треды (локально)
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("df-hidden-threads") || "[]"); } catch { return []; }
  });
  const [confirmDel, setConfirmDel] = useState<{ key: string; title: string } | null>(null);

  function threadKey(n: Notification): string | null {
    if (n.chatMeta) return `chat:${n.chatMeta.debtId || ""}:${n.chatMeta.rentalId || ""}`;
    if (n.supportMeta) return `support:${n.supportMeta.ticketId}`;
    return null;
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
                <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isChat ? "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(99,102,241,0.25))" : "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(99,102,241,0.25))" }}>
                  <Icon name={isChat ? "MessageCircle" : "LifeBuoy"} size={20} className={isChat ? "text-purple-300" : "text-sky-300"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-foreground truncate">{th.title}</p>
                    <p className="text-[11px] text-muted-foreground flex-shrink-0">{n.date}</p>
                  </div>
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
                onClick={() => !isReplyable && onMarkRead(n.id)}
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
export function ArchiveSection({ contacts, t, locale, archiveDebts }: { contacts: Contact[]; t: ReturnType<typeof getT>; locale: string; archiveDebts: Debt[] }) {
  const [filter, setFilter] = useState<"returned" | "deleted">("returned");
  const [search, setSearch] = useState("");
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
              className="glass rounded-2xl p-4 flex items-center gap-4 opacity-80 hover:opacity-100 transition-opacity"
              style={{ animationDelay: `${i * 0.05}s`, borderLeft: isDeleted ? "3px solid #f87171" : undefined }}
            >
              <Avatar initials={d.avatar} color={contact?.color} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-semibold truncate ${isDeleted ? "text-muted-foreground line-through" : "text-foreground"}`}>{d.name}</p>
                </div>
                {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(d.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-lg font-bold font-heading ${isDeleted ? "text-muted-foreground line-through" : "text-green-400"}`}>{fmt(d.amount)}</p>
                {isDeleted ? (
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
                    <Icon name="Trash2" size={10} />
                    {/* TODO: i18n */}Удалён
                  </span>
                ) : (
                  <StatusBadge status="paid" t={t} />
                )}
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
          <p className="font-semibold text-foreground">{t.noContacts}</p>
          <p className="text-xs text-muted-foreground">{t.contactsHint}</p>
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
  const overdueCount = [...lentDebts, ...borrowedDebts].filter(d => d.status === "overdue").length;
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
          <p className="text-xs text-muted-foreground mt-1">{borrowedActiveCount} {t.activeDebts.toLowerCase()}</p>
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
  profile: { name: string; phone: string; email: string };
  onProfileChange: (p: { name: string; phone: string; email: string }) => void;
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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