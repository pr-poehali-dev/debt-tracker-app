import { useState } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  debtId: string;
  debtTitle: string;
  defaultAmount: number;
  token: string;
  onClose: () => void;
  onSent?: () => void;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function ManualReturnModal({ debtId, debtTitle, defaultAmount, token, onClose, onSent }: Props) {
  const [amount, setAmount] = useState<string>(String(Math.round(defaultAmount)));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numAmount = parseFloat(amount.replace(/\s/g, "").replace(",", "."));

  async function send() {
    if (!numAmount || numAmount <= 0) {
      setError("Введите сумму больше нуля");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { default: urls } = await import("../../backend/func2url.json");
      const res = await fetch(`${urls["debts"]}?action=pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ debt_id: debtId, amount: numAmount, note: note.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось отправить запрос");
      }
      setSuccess(true);
      onSent?.();
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
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
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-5">
          <div className="flex items-center justify-between">
            <button onClick={onClose} disabled={loading} className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-50">
              <Icon name="ChevronLeft" size={18} className="text-white" />
            </button>
            <span className="text-xs px-3 py-1 rounded-full font-medium bg-white/20 text-white">Возврат вне приложения</span>
          </div>
          <p className="text-white/80 text-sm mt-3">Вернул лично</p>
          <p className="text-xl font-bold text-white font-heading mt-1 truncate">{debtTitle}</p>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto">
          {success ? (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                <Icon name="Check" size={28} className="text-green-400" />
              </div>
              <p className="font-semibold text-foreground">Запрос отправлен</p>
              <p className="text-xs text-muted-foreground max-w-xs">Кредитор увидит уведомление и подтвердит или отклонит возврат</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Сумма возврата</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setError(null); }}
                    className="w-full glass rounded-2xl px-4 py-3 pr-12 text-lg font-bold font-heading text-foreground outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₽</span>
                </div>
                {numAmount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">Будет отправлено: <span className="text-green-400 font-medium">{fmt(numAmount)}</span></p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Комментарий (необязательно)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  className="w-full glass rounded-2xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none"
                  placeholder="Например: вернул наличкой при встрече"
                />
              </div>

              <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <Icon name="Info" size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">Кредитор должен подтвердить возврат. До его согласия долг останется активным.</p>
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">{error}</div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 rounded-2xl bg-white/5 text-foreground font-medium text-sm border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  onClick={send}
                  disabled={loading || !numAmount}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-sm shadow-lg shadow-green-500/20 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? (
                    <Icon name="Loader2" size={16} className="animate-spin" />
                  ) : (
                    <>
                      <Icon name="HandCoins" size={16} />
                      Отправить
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}