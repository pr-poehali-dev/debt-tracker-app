import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";
import type { PersonalLoan, ExtraPayment } from "@/components/PersonalLoanModal";
import { computeSchedule } from "@/lib/loanSchedule";

interface Props {
  loan: PersonalLoan;
  onClose: () => void;
  onSave: (loan: PersonalLoan) => void;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function ExtraPaymentModal({ loan, onClose, onSave }: Props) {
  const [mode, setMode] = useState<"reducePayment" | "reduceTerm">("reducePayment");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");

  const sum = parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || 0;

  const before = useMemo(() => computeSchedule(loan), [loan]);
  const after = useMemo(() => {
    if (sum <= 0) return before;
    const extra: ExtraPayment = { id: "preview", date, amount: sum, mode };
    return computeSchedule({ ...loan, extraPayments: [...(loan.extraPayments || []), extra] });
  }, [loan, sum, date, mode, before]);

  function playSuccess() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const notes = [880, 1175, 1568];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        const start = ctx.currentTime + i * 0.09;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch { /* ignore */ }
  }

  function handleSave() {
    if (sum <= 0) { setError("Введите сумму"); return; }
    if (sum > before.remaining) { setError(`Сумма больше остатка (${fmt(before.remaining)})`); return; }
    const extra: ExtraPayment = {
      id: Date.now().toString(),
      date,
      amount: sum,
      mode,
    };
    const paidMonths = loan.paidMonths.includes(date) ? loan.paidMonths : [...loan.paidMonths, date];
    onSave({ ...loan, extraPayments: [...(loan.extraPayments || []), extra], paidMonths });
    playSuccess();
    onClose();
  }

  const newMonthly = after.currentMonthly;
  const monthsSaved = before.monthCount - after.monthCount;
  const interestSaved = before.totalInterest - after.totalInterest;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col animate-slide-up"
        style={{ maxHeight: "90dvh", background: "var(--app-bg)", borderRadius: "20px 20px 0 0" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={onClose}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div>
            <p className="font-semibold text-foreground">Погасить частично</p>
            <p className="text-xs text-muted-foreground">{loan.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 glass rounded-xl flex items-center justify-center">
            <Icon name="X" size={14} />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          style={{ paddingBottom: "max(100px, calc(env(safe-area-inset-bottom) + 100px))" }}
        >
          {/* Текущий остаток */}
          <div className="glass rounded-2xl p-4" style={{ borderLeft: "3px solid rgba(56,189,248,0.4)" }}>
            <p className="text-xs text-muted-foreground mb-1">Текущий остаток</p>
            <p className="text-2xl font-bold font-heading" style={{ color: "#7dd3fc" }}>{fmt(before.remaining)}</p>
            <p className="text-xs text-muted-foreground mt-1">Платёж сейчас: {fmt(before.currentMonthly)} / мес.</p>
          </div>

          {/* Режим */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Что уменьшить</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode("reducePayment")}
                className="glass rounded-2xl p-3 text-left transition-all"
                style={{
                  border: mode === "reducePayment" ? "1.5px solid rgba(56,189,248,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  background: mode === "reducePayment" ? "rgba(56,189,248,0.08)" : undefined,
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Уменьшить платёж</span>
                  {mode === "reducePayment" && <Icon name="CheckCircle2" size={16} className="text-sky-400" />}
                </div>
                <p className="text-[11px] text-muted-foreground">Срок прежний, платёж меньше</p>
              </button>
              <button onClick={() => setMode("reduceTerm")}
                className="glass rounded-2xl p-3 text-left transition-all"
                style={{
                  border: mode === "reduceTerm" ? "1.5px solid rgba(56,189,248,0.6)" : "1px solid rgba(255,255,255,0.08)",
                  background: mode === "reduceTerm" ? "rgba(56,189,248,0.08)" : undefined,
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">Уменьшить срок</span>
                  {mode === "reduceTerm" && <Icon name="CheckCircle2" size={16} className="text-sky-400" />}
                </div>
                <p className="text-[11px] text-muted-foreground">Платёж прежний, срок меньше</p>
              </button>
            </div>
          </div>

          {/* Сумма */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Сумма досрочного платежа</label>
            <input
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(""); }}
              placeholder="0 ₽"
              type="number"
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-500/50 transition-colors"
            />
            <div className="flex gap-2 flex-wrap mt-2">
              {[before.currentMonthly, before.currentMonthly * 2, Math.round(before.remaining * 0.25), Math.round(before.remaining * 0.5)].filter(v => v > 0 && v <= before.remaining).map((v, idx) => (
                <button key={idx} onClick={() => { setAmount(String(v)); setError(""); }}
                  className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-sky-400 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {fmt(v)}
                </button>
              ))}
            </div>
          </div>

          {/* Месяц платежа */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Месяц платежа</label>
            <input
              value={date}
              onChange={e => setDate(e.target.value)}
              type="month"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/50 transition-colors"
              style={{ colorScheme: "dark" }}
            />
          </div>

          {/* Превью пересчёта */}
          {sum > 0 && (
            <div className="glass rounded-2xl p-4 space-y-2" style={{ border: "1px solid rgba(56,189,248,0.2)" }}>
              <p className="text-xs text-muted-foreground mb-2">Как изменится</p>
              {mode === "reducePayment" ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Новый платёж</span>
                    <span className="font-bold text-sky-400">{fmt(newMonthly)} <span className="text-xs text-muted-foreground">/ мес.</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Экономия в месяц</span>
                    <span className="text-sm text-green-400">−{fmt(Math.max(0, before.currentMonthly - newMonthly))}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Сократите срок на</span>
                    <span className="font-bold text-sky-400">{monthsSaved} мес.</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Платёж останется</span>
                    <span className="text-sm text-foreground">{fmt(before.currentMonthly)}</span>
                  </div>
                </>
              )}
              {interestSaved > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-sm text-muted-foreground">Экономия на процентах</span>
                  <span className="text-sm text-green-400">−{fmt(interestSaved)}</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-white/5">
          <button onClick={handleSave}
            disabled={sum <= 0}
            className="w-full py-3 rounded-2xl font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #38bdf8, #0ea5e9)" }}>
            Внести платёж
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}