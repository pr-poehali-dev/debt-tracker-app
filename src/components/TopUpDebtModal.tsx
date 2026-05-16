import { useState } from "react";
import Icon from "@/components/ui/icon";
import { type Lang, getT, type Translations } from "@/i18n";

interface Props {
  debtId: string;
  debtTitle: string;
  currentAmount: number;
  token: string;
  onClose: () => void;
  onSent?: () => void;
  t?: Translations;
  lang?: Lang;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function TopUpDebtModal({ debtId, debtTitle, currentAmount, token, onClose, onSent, t: tProp, lang }: Props) {
  const t = tProp ?? getT(lang ?? "ru");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numAmount = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
  const newTotal = !Number.isNaN(numAmount) && numAmount > 0 ? Math.round(currentAmount) + Math.round(numAmount) : Math.round(currentAmount);

  async function send() {
    if (!numAmount || numAmount <= 0) {
      setError(t.topUpAmountError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { default: urls } = await import("../../backend/func2url.json");
      const res = await fetch(`${urls["debts"]}?action=topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ debt_id: debtId, amount: numAmount, note: note.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t.errorRequestFailed);
      }
      setSuccess(true);
      onSent?.();
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={loading ? undefined : onClose} />
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden animate-fade-in border border-white/10 shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: "#1a1d2e" }}
      >
        <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-white/20 text-white">{t.topUpTitle}</span>
            <button onClick={onClose} disabled={loading} aria-label="Закрыть" className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-50 flex-shrink-0">
              <Icon name="X" size={20} className="text-white" />
            </button>
          </div>
          <p className="text-white/80 text-sm mt-3">Текущая сумма: {fmt(Math.round(currentAmount))}</p>
          <p className="text-xl font-bold text-white font-heading mt-1 truncate">{debtTitle}</p>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto">
          {success ? (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-purple-500/15 flex items-center justify-center">
                <Icon name="Check" size={28} className="text-purple-400" />
              </div>
              <p className="font-semibold text-foreground">Запрос отправлен</p>
              <p className="text-xs text-muted-foreground max-w-xs">{t.topUpHint}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Сумма увеличения</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,\s]/g, "")); setError(null); }}
                    placeholder="0"
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-foreground text-lg font-semibold outline-none focus:border-purple-400/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">₽</span>
                </div>
                {numAmount > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Новая сумма долга: <span className="text-purple-400 font-semibold">{fmt(newTotal)}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Комментарий (необязательно)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Например: ещё на бензин"
                  rows={3}
                  disabled={loading}
                  maxLength={500}
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-foreground text-sm outline-none focus:border-purple-400/50 resize-none"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div className="rounded-2xl bg-purple-500/10 border border-purple-500/20 px-4 py-3 flex gap-3">
                <Icon name="Info" size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80">
                  Заёмщик получит уведомление. После его подтверждения сумма добавится к долгу.
                </p>
              </div>

              <button
                onClick={send}
                disabled={loading || !numAmount || numAmount <= 0}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Icon name="Loader2" size={18} className="animate-spin" />
                    Отправка...
                  </>
                ) : (
                  <>
                    <Icon name="Plus" size={18} />
                    Отправить запрос
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}