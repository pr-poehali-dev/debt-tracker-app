import { useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/ui/icon";

interface Props {
  onClose: () => void;
  onSave: (loan: PersonalLoan) => void;
}

export interface ExtraPayment {
  id: string;
  date: string;
  amount: number;
  mode: "reducePayment" | "reduceTerm";
}

export interface PersonalLoan {
  id: string;
  title: string;
  totalAmount: number;
  monthlyPayment: number;
  startDate: string;
  dueDate: string;
  paidMonths: string[];
  note?: string;
  notifyDay: number;
  interestRate?: number;
  termMonths?: number;
  extraPayments?: ExtraPayment[];
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function PersonalLoanModal({ onClose, onSave }: Props) {
  const [step, setStep] = useState<"form" | "schedule">("form");
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [months, setMonths] = useState("12");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 7));
  const [notifyDay, setNotifyDay] = useState("1");
  const [note, setNote] = useState("");
  const [interestRate, setInterestRate] = useState("0");
  const [error, setError] = useState("");

  const total = parseFloat(totalAmount.replace(/\s/g, "")) || 0;
  const monthCount = parseInt(months) || 1;
  const rate = Math.max(0, parseFloat(interestRate.replace(",", ".")) || 0);
  const monthly = (() => {
    if (total <= 0) return 0;
    if (rate <= 0) return Math.ceil(total / monthCount);
    const r = rate / 100 / 12;
    const pmt = (total * r * Math.pow(1 + r, monthCount)) / (Math.pow(1 + r, monthCount) - 1);
    return Math.ceil(pmt);
  })();
  const totalToPay = monthly * monthCount;
  const overpay = Math.max(0, totalToPay - total);

  const schedule = Array.from({ length: monthCount }, (_, i) => {
    const d = new Date(startDate + "-01");
    d.setMonth(d.getMonth() + i);
    return d.toISOString().slice(0, 7);
  });

  const dueDate = schedule[schedule.length - 1];

  function handleSave() {
    if (!title.trim()) { setError("Введите название займа"); return; }
    if (!total || total <= 0) { setError("Введите сумму"); return; }
    if (monthCount < 1 || monthCount > 360) { setError("Срок от 1 до 360 месяцев"); return; }

    const loan: PersonalLoan = {
      id: Date.now().toString(),
      title: title.trim(),
      totalAmount: total,
      monthlyPayment: monthly,
      startDate,
      dueDate,
      paidMonths: [],
      note: note.trim() || undefined,
      notifyDay: parseInt(notifyDay) || 1,
      interestRate: rate > 0 ? rate : undefined,
      termMonths: monthCount,
      extraPayments: [],
    };

    onSave(loan);
    onClose();
  }

  const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={e => e.currentTarget === e.target && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col animate-slide-up"
        style={{ maxHeight: "90dvh", background: "var(--app-bg)", borderRadius: "20px 20px 0 0" }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={onClose}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div>
            <p className="font-semibold text-foreground">Личный займ</p>
            <p className="text-xs text-muted-foreground">Трекер для себя, без QR</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 glass rounded-xl flex items-center justify-center">
            <Icon name="X" size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "form" ? (
            <>
              {/* Название */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название *</label>
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); setError(""); }}
                  placeholder="Займ в банке, у друга..."
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-500/50 transition-colors"
                />
              </div>

              {/* Сумма */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Общая сумма займа *</label>
                <input
                  value={totalAmount}
                  onChange={e => { setTotalAmount(e.target.value); setError(""); }}
                  placeholder="100 000"
                  type="number"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-500/50 transition-colors"
                />
              </div>

              {/* Срок */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Срок (месяцев)</label>
                <div className="flex gap-2 flex-wrap">
                  {[3, 6, 12, 24, 36, 60].map(m => (
                    <button key={m} onClick={() => setMonths(m.toString())}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                      style={{
                        background: months === m.toString() ? "rgba(56,189,248,0.3)" : "rgba(255,255,255,0.05)",
                        border: months === m.toString() ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
                        color: months === m.toString() ? "#7dd3fc" : "var(--muted-foreground)",
                      }}>
                      {m} мес
                    </button>
                  ))}
                  <input
                    value={months}
                    onChange={e => setMonths(e.target.value)}
                    type="number"
                    min="1"
                    max="360"
                    className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-foreground outline-none focus:border-sky-500/50 transition-colors"
                    placeholder="Свой"
                  />
                </div>
              </div>

              {/* Процентная ставка */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Процентная ставка (% годовых)</label>
                <div className="flex gap-2 flex-wrap">
                  {[0, 5, 10, 15, 20, 25].map(r => (
                    <button key={r} onClick={() => setInterestRate(r.toString())}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                      style={{
                        background: interestRate === r.toString() ? "rgba(56,189,248,0.3)" : "rgba(255,255,255,0.05)",
                        border: interestRate === r.toString() ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.1)",
                        color: interestRate === r.toString() ? "#7dd3fc" : "var(--muted-foreground)",
                      }}>
                      {r === 0 ? "Без %" : `${r}%`}
                    </button>
                  ))}
                  <input
                    value={interestRate}
                    onChange={e => setInterestRate(e.target.value)}
                    type="number"
                    min="0"
                    max="200"
                    step="0.1"
                    className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-foreground outline-none focus:border-sky-500/50 transition-colors"
                    placeholder="Свой"
                  />
                </div>
              </div>

              {/* Начало */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Начало выплат</label>
                <input
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  type="month"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/50 transition-colors"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              {/* Уведомление */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Напоминать в день месяца</label>
                <div className="flex items-center gap-3">
                  <input
                    value={notifyDay}
                    onChange={e => setNotifyDay(e.target.value)}
                    type="number"
                    min="1"
                    max="28"
                    className="w-20 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/50 transition-colors"
                  />
                  <p className="text-xs text-muted-foreground">-е число каждого месяца</p>
                </div>
              </div>

              {/* Заметка */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Заметка (необязательно)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Условия, кому платить..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-500/50 transition-colors resize-none"
                />
              </div>

              {/* Превью */}
              {total > 0 && (
                <div className="glass rounded-2xl p-4 space-y-2" style={{ border: "1px solid rgba(56,189,248,0.2)" }}>
                  <p className="text-xs text-muted-foreground">Предварительный расчёт</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Сумма займа</span>
                    <span className="font-bold text-foreground">{fmt(total)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Ежемесячный платёж</span>
                    <span className="font-bold text-sky-400">{fmt(monthly)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Срок</span>
                    <span className="text-sm text-foreground">{monthCount} мес.</span>
                  </div>
                  {rate > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Ставка</span>
                        <span className="text-sm text-foreground">{rate}% годовых</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Переплата</span>
                        <span className="text-sm text-amber-400">{fmt(overpay)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-sm text-muted-foreground">Итого к выплате</span>
                        <span className="font-bold text-foreground">{fmt(totalToPay)}</span>
                      </div>
                    </>
                  )}
                  <button onClick={() => setStep("schedule")}
                    className="w-full text-xs text-sky-400 hover:text-sky-300 transition-colors mt-1 text-right">
                    Посмотреть график →
                  </button>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          ) : (
            <>
              {/* График платежей */}
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep("form")} className="w-8 h-8 glass rounded-xl flex items-center justify-center">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <p className="font-medium text-foreground">График платежей</p>
              </div>
              <div className="space-y-2">
                {schedule.map((month, i) => {
                  const [y, m] = month.split("-");
                  return (
                    <div key={month} className="flex items-center justify-between glass rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                        <span className="text-sm text-foreground">{MONTHS_RU[parseInt(m) - 1]} {y}</span>
                      </div>
                      <span className="font-medium text-sky-400">{fmt(i < monthCount - 1 ? monthly : total - monthly * (monthCount - 1))}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-white/5">
          <button
            onClick={handleSave}
            className="w-full py-3 rounded-2xl font-semibold text-sm text-white transition-all"
            style={{ background: "linear-gradient(135deg, #38bdf8, #0ea5e9)" }}
          >
            Добавить займ
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}