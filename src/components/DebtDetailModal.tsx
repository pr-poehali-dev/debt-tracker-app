import { useState } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

const DEBTS_URL = func2url["debts"];

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
  token?: string;
  onClose: () => void;
  onOpenChat?: (debtId: string, title: string) => void;
  onMarkPaid?: (debtId: string) => void;
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

function PaymentModal({ debt, token, onClose }: { debt: Debt; token: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const val = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
    if (!val || val <= 0) { setError("Введите сумму"); return; }
    setSending(true); setError("");
    try {
      const res = await fetch(`${DEBTS_URL}?action=pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ debt_id: debt.debtDbId, amount: val, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) { setDone(true); }
      else { setError(data.error || "Ошибка отправки"); }
    } catch { setError("Нет ответа от сервера"); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass rounded-t-3xl p-6 space-y-4 animate-slide-up">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">Отправить платёж</p>
          <button onClick={onClose} className="w-8 h-8 glass rounded-xl flex items-center justify-center">
            <Icon name="X" size={14} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto" style={{ background: "rgba(34,197,94,0.15)" }}>
              <Icon name="CheckCircle2" size={28} className="text-green-400" />
            </div>
            <p className="font-semibold text-foreground">Запрос отправлен!</p>
            <p className="text-xs text-muted-foreground">Кредитор получит уведомление и подтвердит платёж</p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-medium text-white mt-2"
              style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Долг</p>
              <p className="text-sm font-medium text-foreground">{debt.name}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сумма платежа</label>
              <input
                type="number"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(""); }}
                placeholder="Например: 5 000"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-lg font-bold text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Комментарий (необязательно)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Например: частичная оплата"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={send}
              disabled={sending || !amount}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
            >
              {sending ? "Отправляем..." : "Отправить платёж"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DebtDetailModal({ debt, dir, locale, token = "", onClose, onOpenChat, onMarkPaid }: Props) {
  const [showPayment, setShowPayment] = useState(false);
  if (!debt) return null;

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
    <>
      {showPayment && (
        <PaymentModal debt={debt} token={token} onClose={() => setShowPayment(false)} />
      )}

      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl overflow-hidden animate-fade-in">

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
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2 pb-6">
              {/* Должник: отправить платёж */}
              {dir === "borrowed" && debt.debtDbId && debt.borrowerDecision === "accepted" && debt.status !== "paid" && (
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
                >
                  <Icon name="Banknote" size={16} />
                  Добавить платёж
                </button>
              )}

              <div className="flex gap-2">
                {debt.debtDbId && onOpenChat && debt.borrowerDecision === "accepted" && (
                  <button
                    onClick={() => { onClose(); onOpenChat(debt.debtDbId!, debt.name); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors font-medium text-sm border border-purple-500/20"
                  >
                    <Icon name="MessageCircle" size={16} />
                    Открыть чат
                  </button>
                )}
                {debt.debtDbId && debt.status !== "paid" && onMarkPaid && dir === "lent" && (
                  <button
                    onClick={() => { onMarkPaid(debt.debtDbId!); onClose(); }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors font-medium text-sm border border-green-500/20"
                  >
                    <Icon name="CheckCircle2" size={16} />
                    Возвращён
                  </button>
                )}
              </div>
            </div>

            {!debt.debtDbId && (
              <p className="text-center text-xs text-muted-foreground pt-1 pb-4">Демо-данные — действия недоступны</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}