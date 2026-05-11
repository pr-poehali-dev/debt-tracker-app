import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";

interface Debt {
  id: number;
  contactId: number;
  name: string;
  amount: number;
  dueDate: string;
  status: "active" | "overdue" | "paid";
  avatar: string;
  note?: string;
  debtDbId?: string;
  borrowerDecision?: string;
  interestRate?: number;
  interestType?: "simple" | "compound";
}

interface Props {
  debt: Debt | null;
  dir: "lent" | "borrowed";
  locale: string;
  onClose: () => void;
  onOpenChat?: (debtId: string, title: string) => void;
  onMarkPaid?: (debtId: string) => void;
  token?: string;
  onPaymentAccepted?: (debtId: string, newAmount: number, fullyPaid: boolean) => void;
}

interface PaymentItem {
  id: number;
  amount: number;
  note: string | null;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  from_name: string;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function calcTotalWithInterest(amount: number, rate: number, type: string, dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return amount;
  const years = days / 365;
  if (type === "compound") return Math.round(amount * Math.pow(1 + rate / 100, years));
  return Math.round(amount * (1 + (rate / 100) * years));
}

export default function DebtDetailModal({ debt, dir, locale, onClose, onOpenChat, onMarkPaid, token, onPaymentAccepted }: Props) {
  const [history, setHistory] = useState<PaymentItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const debtDbId = debt?.debtDbId;
  useEffect(() => {
    if (!debtDbId) { setHistory([]); return; }
    const t = token || localStorage.getItem("df-token") || "";
    if (!t) return;
    let cancelled = false;
    setLoadingHistory(true);
    (async () => {
      try {
        const { default: urls } = await import("../../backend/func2url.json");
        const res = await fetch(`${urls["debts"]}?action=pay&debt_id=${debtDbId}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHistory(Array.isArray(data.requests) ? data.requests : []);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debtDbId, token]);

  async function decide(p: PaymentItem, decision: "accepted" | "rejected") {
    const t = token || localStorage.getItem("df-token") || "";
    if (!t || !debtDbId) return;
    setDecidingId(p.id);
    try {
      const { default: urls } = await import("../../backend/func2url.json");
      const res = await fetch(`${urls["debts"]}?action=pay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ payment_request_id: p.id, decision }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setHistory(prev => prev.map(x => x.id === p.id ? { ...x, status: decision } : x));
      if (decision === "accepted" && onPaymentAccepted && debtDbId) {
        onPaymentAccepted(
          debtDbId,
          typeof data.new_amount === "number" ? data.new_amount : 0,
          Boolean(data.fully_paid),
        );
        if (data.fully_paid) onClose();
      }
    } finally {
      setDecidingId(null);
    }
  }

  if (!debt) return null;

  const pendingPayment = dir === "lent" ? history.find(h => h.status === "pending") : null;

  const statusMap = {
    active:  { label: "Активен",    cls: "bg-blue-500/15 text-blue-400 border border-blue-500/20" },
    overdue: { label: "Просрочен",  cls: "bg-red-500/15 text-red-400 border border-red-500/20" },
    paid:    { label: "Возвращён",  cls: "bg-green-500/15 text-green-400 border border-green-500/20" },
  };
  const status = statusMap[debt.status];
  const gradientClass = dir === "lent" ? "from-purple-500 to-indigo-500" : "from-sky-500 to-blue-600";
  const daysLeft = Math.ceil((new Date(debt.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const total = debt.interestRate
    ? calcTotalWithInterest(debt.amount, debt.interestRate, debt.interestType || "simple", debt.dueDate)
    : null;
  const interest = total ? total - debt.amount : null;
  const hasInterest = total && total !== debt.amount;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden animate-fade-in border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "#1a1d2e" }}
      >

        {/* Header */}
        <div className={`bg-gradient-to-r ${gradientClass} p-5 pb-8`}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
              <Icon name="ChevronLeft" size={18} className="text-white" />
            </button>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${status.cls}`}>{status.label}</span>
          </div>
          <p className="text-white/70 text-sm mb-1">{dir === "lent" ? "Вы дали в долг" : "Вы взяли в долг"}</p>
          <p className="text-3xl font-bold text-white font-heading">{fmt(total ?? debt.amount)}</p>
          {hasInterest && (
            <p className="text-white/60 text-sm mt-1">{fmt(debt.amount)} + {debt.interestRate}% ({debt.interestType === "compound" ? "сложные" : "простые"})</p>
          )}
        </div>

        {/* Avatar overlap */}
        <div className="flex justify-center -mt-6 mb-2 relative z-10">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center font-bold text-white text-base shadow-lg ring-4 ring-[#0d0f1a]`}>
            {debt.avatar}
          </div>
        </div>

        {/* Content */}
        <div className="px-5 pb-6 space-y-3">
          <div className="text-center mb-4">
            <p className="font-semibold text-foreground text-lg">{debt.name}</p>
          </div>

          <div className="space-y-2">
            {hasInterest && (
              <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                  <Icon name="Percent" size={16} className="text-violet-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Разбивка суммы</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-sm text-foreground">Тело: <span className="font-medium">{fmt(debt.amount)}</span></span>
                    <span className="text-sm text-violet-400">Проценты: <span className="font-medium">+{fmt(interest ?? 0)}</span></span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                <Icon name="Calendar" size={16} className="text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Срок возврата</p>
                <p className="text-sm font-medium text-foreground">
                  {new Date(debt.dueDate).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              {debt.status !== "paid" && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${daysLeft < 0 ? "bg-red-500/15 text-red-400" : daysLeft <= 3 ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400"}`}>
                  {daysLeft < 0 ? `${Math.abs(daysLeft)} дн. назад` : daysLeft === 0 ? "Сегодня" : `${daysLeft} дн.`}
                </span>
              )}
            </div>

            {debt.note && dir === "lent" && (
              <div className="flex items-start gap-3 glass rounded-2xl px-4 py-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name="FileText" size={16} className="text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Заметка</p>
                  <p className="text-sm text-foreground">{debt.note}</p>
                </div>
              </div>
            )}

            {debt.borrowerDecision && (
              <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${debt.borrowerDecision === "accepted" ? "bg-green-500/15" : "bg-red-500/15"}`}>
                  <Icon name={debt.borrowerDecision === "accepted" ? "CheckCircle2" : "XCircle"} size={16} className={debt.borrowerDecision === "accepted" ? "text-green-400" : "text-red-400"} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Решение</p>
                  <p className="text-sm font-medium text-foreground">
                    {debt.borrowerDecision === "accepted" ? "Должник принял долг" : "Должник отклонил долг"}
                  </p>
                </div>
              </div>
            )}

            {pendingPayment && dir === "lent" && (
              <div className="rounded-2xl px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.1))", border: "1px solid rgba(16,185,129,0.4)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="BellRing" size={16} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-300">Запрос на возврат</p>
                </div>
                <p className="text-sm text-foreground">
                  {pendingPayment.from_name} вернул(а) <span className="font-bold text-emerald-400">{fmt(pendingPayment.amount)}</span>
                </p>
                {pendingPayment.note && <p className="text-[11px] text-foreground/70 italic mt-1">«{pendingPayment.note}»</p>}
                <p className="text-[10px] text-muted-foreground mt-1">После подтверждения остаток станет {fmt(Math.max(0, debt.amount - pendingPayment.amount))}</p>
              </div>
            )}

            {debt.debtDbId && (() => {
              const paidTotal = history.filter(h => h.status === "accepted").reduce((s, h) => s + h.amount, 0);
              const totalAmount = total ?? debt.amount;
              const remaining = Math.max(0, totalAmount - paidTotal);
              const progress = totalAmount > 0 ? Math.min(100, (paidTotal / totalAmount) * 100) : 0;
              const hasPayments = history.filter(h => h.status === "accepted").length > 0;
              return (
              <div className="glass rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <Icon name="History" size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">История платежей</p>
                    <p className="text-sm font-medium text-foreground">
                      {hasPayments ? `Остаток: ${fmt(remaining)}` : "Ещё нет платежей"}
                    </p>
                  </div>
                </div>
                {hasPayments && (
                  <div className="mb-2">
                    <div className="h-2 rounded-full bg-emerald-500/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                      <span>Оплачено: {fmt(paidTotal)}</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                {loadingHistory && history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Загрузка…</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Платежей пока нет</p>
                ) : (
                  <div className="space-y-1.5 mt-1">
                    {history.map(p => {
                      const isAcc = p.status === "accepted";
                      const isRej = p.status === "rejected";
                      const isPend = p.status === "pending";
                      const color = isAcc ? "#34d399" : isRej ? "#f87171" : "#fbbf24";
                      const bg = isAcc ? "rgba(52,211,153,0.1)" : isRej ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)";
                      const border = isAcc ? "rgba(52,211,153,0.25)" : isRej ? "rgba(248,113,113,0.25)" : "rgba(251,191,36,0.25)";
                      const iconName = isAcc ? "CheckCircle2" : isRej ? "XCircle" : "Clock";
                      const statusLabel = isAcc ? "подтверждён" : isRej ? "отклонён" : "ожидает";
                      const d = new Date(p.created_at);
                      const dateStr = d.toLocaleDateString(locale, { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div key={p.id} className="rounded-xl px-3 py-2 flex items-start gap-2" style={{ background: bg, border: `1px solid ${border}` }}>
                          <Icon name={iconName} size={14} style={{ color, marginTop: 2 }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold" style={{ color }}>{fmt(p.amount)}</span>
                              <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {p.from_name} • {statusLabel}
                            </p>
                            {p.note && <p className="text-[11px] text-foreground/80 mt-0.5 italic">«{p.note}»</p>}
                            {isPend && dir === "borrowed" && (
                              <p className="text-[10px] mt-0.5" style={{ color: "#fbbf24" }}>Ждёт подтверждения кредитора</p>
                            )}
                            {isPend && dir === "lent" && (
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => decide(p, "rejected")}
                                  disabled={decidingId === p.id}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50 active:scale-95 transition-transform"
                                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                                >
                                  <Icon name="X" size={12} /> Отклонить
                                </button>
                                <button
                                  onClick={() => decide(p, "accepted")}
                                  disabled={decidingId === p.id}
                                  className="flex-[1.4] flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50 active:scale-95 transition-transform"
                                  style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff" }}
                                >
                                  {decidingId === p.id ? (
                                    <Icon name="Loader2" size={12} className="animate-spin" />
                                  ) : (
                                    <><Icon name="Check" size={12} /> Подтвердить {fmt(p.amount)}</>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })()}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 pb-6">
            {debt.debtDbId && onOpenChat && debt.borrowerDecision === "accepted" && (
              <button
                onClick={() => { onClose(); onOpenChat(debt.debtDbId!, debt.name); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors font-medium text-sm border border-purple-500/20"
              >
                <Icon name="MessageCircle" size={16} />
                Открыть чат
              </button>
            )}
            {debt.debtDbId && debt.status !== "paid" && onMarkPaid && dir === "lent" && !pendingPayment && (
              <button
                onClick={() => setConfirmClose(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors font-medium text-sm border border-green-500/20"
              >
                <Icon name="CheckCircle2" size={16} />
                Возвращён
              </button>
            )}
          </div>

          {!debt.debtDbId && (
            <p className="text-center text-xs text-muted-foreground pt-1 pb-4">Демо-данные — действия недоступны</p>
          )}
        </div>
      </div>

      {confirmClose && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setConfirmClose(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-5 animate-slide-up"
            style={{ background: "linear-gradient(180deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                <Icon name="CheckCircle2" size={24} className="text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-foreground">Закрыть долг?</p>
                <p className="text-xs text-muted-foreground">Действие нельзя отменить</p>
              </div>
            </div>
            <p className="text-sm text-foreground/90 mb-1">
              Вы уверены, что хотите закрыть долг <span className="font-semibold">«{debt.name}»</span>?
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Сумма {fmt(debt.amount)} будет считаться полностью возвращённой, долг уйдёт в архив.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-medium transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#cbd5e1" }}
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  setConfirmClose(false);
                  if (onMarkPaid && debt.debtDbId) onMarkPaid(debt.debtDbId);
                  onClose();
                }}
                className="flex-[1.3] py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff" }}
              >
                <Icon name="Check" size={14} />
                Да, закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}