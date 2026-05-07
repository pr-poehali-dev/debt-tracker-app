import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

const API_URL = "https://functions.poehali.dev/bccbfdb0-52f8-4958-b4f5-a7be6259ffd9";

// ─── Tiny QR via Google Charts API (no deps) ────────────────────────────────
function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=13-15-26&color=168-85-247&format=svg&qzone=2`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=png&qzone=2`}
        width={size}
        height={size}
        alt="QR код"
        className="rounded-2xl"
        style={{ filter: "invert(1) hue-rotate(270deg) saturate(3)" }}
      />
    </div>
  );
}

// ─── Share debt viewer (when opened via QR link) ─────────────────────────────
export function SharedDebtView({ token }: { token: string }) {
  const [debt, setDebt] = useState<Record<string, string | number | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"lender" | "borrower" | null>(null);
  const [myName, setMyName] = useState("");
  const [myPhone, setMyPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else {
          setDebt(d);
          if (d.borrower_name) setConfirmed(true);
        }
      })
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [token]);

  async function confirm() {
    if (!myName.trim()) return;
    setSaving(true);
    const r = await fetch(`${API_URL}?token=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ borrower_name: myName, borrower_phone: myPhone }),
    });
    const d = await r.json();
    if (!d.error) { setDebt(d); setConfirmed(true); }
    setSaving(false);
  }

  function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

  if (loading) return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-6 text-center max-w-sm w-full">
        <Icon name="AlertCircle" size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-red-400 font-semibold">{error}</p>
        <p className="text-muted-foreground text-sm mt-1">Проверьте ссылку или попросите кредитора отправить заново</p>
      </div>
    </div>
  );

  if (!debt) return null;

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="mesh-bg fixed inset-0 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 gradient-purple rounded-2xl flex items-center justify-center mx-auto mb-3 glow-purple">
            <Icon name="Handshake" size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black font-heading text-gradient-purple">DebtFlow</h1>
          <p className="text-muted-foreground text-sm">Общий долг</p>
        </div>

        {/* Debt card */}
        <div className="glass rounded-3xl p-5 mb-4" style={{ border: "1px solid rgba(168,85,247,0.3)" }}>
          <p className="text-muted-foreground text-xs mb-1 uppercase tracking-wider">Сумма долга</p>
          <p className="text-4xl font-black font-heading text-gradient-purple mb-4">{fmt(Number(debt.amount))}</p>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 gradient-purple rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon name="TrendingUp" size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Кредитор (дал в долг)</p>
                <p className="font-semibold text-foreground">{String(debt.lender_name)}</p>
                {debt.lender_phone && <p className="text-xs text-muted-foreground">{String(debt.lender_phone)}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 gradient-blue rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon name="TrendingDown" size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Должник (взял в долг)</p>
                {debt.borrower_name
                  ? <p className="font-semibold text-foreground">{String(debt.borrower_name)}</p>
                  : <p className="text-muted-foreground italic text-sm">Ещё не подтверждено</p>
                }
              </div>
            </div>

            {debt.due_date && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon name="Calendar" size={16} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Срок возврата</p>
                  <p className="font-semibold text-foreground">
                    {new Date(String(debt.due_date)).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
            )}

            {debt.note && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name="FileText" size={16} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Заметка</p>
                  <p className="font-medium text-foreground">{String(debt.note)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        {confirmed ? (
          <div className="glass rounded-2xl p-4 text-center border border-green-500/20 bg-green-500/5">
            <Icon name="CheckCircle2" size={28} className="text-green-400 mx-auto mb-2" />
            <p className="font-semibold text-green-400">Долг подтверждён обеими сторонами</p>
            <p className="text-xs text-muted-foreground mt-1">Оба видят одинаковые данные</p>
          </div>
        ) : !role ? (
          <div className="glass rounded-2xl p-4">
            <p className="text-sm font-semibold text-center mb-3">Вы — должник по этому долгу?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole("borrower")}
                className="py-2.5 rounded-xl font-medium text-white text-sm"
                style={{ background: "linear-gradient(135deg, #38bdf8, #818cf8)" }}
              >
                Да, я должник
              </button>
              <button
                onClick={() => setRole("lender")}
                className="py-2.5 rounded-xl font-medium glass text-muted-foreground text-sm hover:bg-white/10 transition-colors"
              >
                Нет, я кредитор
              </button>
            </div>
          </div>
        ) : role === "lender" ? (
          <div className="glass rounded-2xl p-4 text-center border border-purple-500/20">
            <Icon name="CheckCircle2" size={24} className="text-purple-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Вы кредитор. Долг уже зарегистрирован на ваше имя.</p>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4">
            <p className="text-sm font-semibold mb-3">Подтвердите, что вы — должник</p>
            <input
              value={myName}
              onChange={e => setMyName(e.target.value)}
              placeholder="Ваше имя"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 mb-2"
            />
            <input
              value={myPhone}
              onChange={e => setMyPhone(e.target.value)}
              placeholder="Телефон (необязательно)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 mb-3"
            />
            <button
              onClick={confirm}
              disabled={saving || !myName.trim()}
              className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
            >
              {saving ? "Подтверждаю..." : "Подтвердить долг"}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          Токен: <span className="font-mono text-purple-400">{String(debt.share_token)}</span>
        </p>
      </div>
    </div>
  );
}

// ─── New Debt Modal ───────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  myName?: string;
}

export default function NewDebtModal({ open, onClose, myName = "" }: Props) {
  const [step, setStep] = useState<"form" | "qr">("form");
  const [loading, setLoading] = useState(false);
  const [createdDebt, setCreatedDebt] = useState<Record<string, string | number | null> | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    lender_name: myName,
    lender_phone: "",
    borrower_name: "",
    note: "",
    due_date: "",
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

  async function create() {
    if (!form.title || !form.amount || !form.lender_name) return;
    setLoading(true);
    try {
      const r = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          amount: parseFloat(form.amount.replace(/\s/g, "")),
          lender_name: form.lender_name,
          lender_phone: form.lender_phone || undefined,
          borrower_name: form.borrower_name || undefined,
          note: form.note || undefined,
          due_date: form.due_date || undefined,
        }),
      });
      const d = await r.json();
      if (d.share_token) { setCreatedDebt(d); setStep("qr"); }
    } finally {
      setLoading(false);
    }
  }

  function shareUrl() {
    if (!createdDebt) return "";
    return `${window.location.origin}/?debt=${createdDebt.share_token}`;
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareNative() {
    if (navigator.share) {
      await navigator.share({ title: `Долг: ${createdDebt?.title}`, text: `Сумма: ${fmt(Number(createdDebt?.amount))}`, url: shareUrl() });
    } else copyLink();
  }

  function close() { setStep("form"); setCreatedDebt(null); setForm({ title: "", amount: "", lender_name: myName, lender_phone: "", borrower_name: "", note: "", due_date: "" }); onClose(); }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={e => e.target === e.currentTarget && close()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 w-full max-w-lg glass-strong rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            {step === "qr" && (
              <button onClick={() => setStep("form")} className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                <Icon name="ChevronLeft" size={16} />
              </button>
            )}
            <div>
              <h2 className="font-heading font-bold text-lg">
                {step === "form" ? "Новый займ" : "QR-код долга"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {step === "form" ? "Заполните детали займа" : "Отправьте должнику для подтверждения"}
              </p>
            </div>
          </div>
          <button onClick={close} className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
            <Icon name="X" size={16} />
          </button>
        </div>

        {/* Form step */}
        {step === "form" && (
          <div className="px-5 pb-6 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название / описание *</label>
              <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Займ на ремонт" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сумма (₽) *</label>
              <input value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="10 000" type="number" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ваше имя (кредитор) *</label>
              <input value={form.lender_name} onChange={e => set("lender_name", e.target.value)} placeholder="Иван Иванов" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ваш телефон</label>
              <input value={form.lender_phone} onChange={e => set("lender_phone", e.target.value)} placeholder="+7 999 000 00 00" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Имя должника (необязательно)</label>
              <input value={form.borrower_name} onChange={e => set("borrower_name", e.target.value)} placeholder="Пётр Петров" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Срок возврата</label>
              <input value={form.due_date} onChange={e => set("due_date", e.target.value)} type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-purple-500/50 transition-colors" style={{ colorScheme: "dark" }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Заметка</label>
              <textarea value={form.note} onChange={e => set("note", e.target.value)} placeholder="Дополнительные условия..." rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors resize-none" />
            </div>

            <button
              onClick={create}
              disabled={loading || !form.title || !form.amount || !form.lender_name}
              className="w-full py-3.5 rounded-xl font-semibold text-white disabled:opacity-40 transition-all mt-2"
              style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
            >
              {loading ? "Создаю долг..." : "Создать и получить QR-код"}
            </button>
          </div>
        )}

        {/* QR step */}
        {step === "qr" && createdDebt && (
          <div className="px-5 pb-6">
            {/* Summary */}
            <div className="glass rounded-2xl p-4 mb-4" style={{ border: "1px solid rgba(168,85,247,0.25)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground text-xs">Сумма</span>
                <span className="font-bold font-heading text-gradient-purple text-xl">{fmt(Number(createdDebt.amount))}</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground text-xs">Кредитор</span>
                <span className="text-sm font-medium">{String(createdDebt.lender_name)}</span>
              </div>
              {createdDebt.due_date && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Срок</span>
                  <span className="text-sm font-medium">{new Date(String(createdDebt.due_date)).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Токен</span>
                <span className="font-mono text-purple-400 font-bold tracking-widest">{String(createdDebt.share_token)}</span>
              </div>
            </div>

            {/* QR */}
            <div className="flex flex-col items-center mb-4">
              <div className="p-4 rounded-2xl mb-3" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}>
                <QRCode value={shareUrl()} size={200} />
              </div>
              <p className="text-xs text-muted-foreground text-center">Должник сканирует QR-код и подтверждает долг</p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={shareNative}
                className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
              >
                <Icon name="Share2" size={18} />
                Поделиться ссылкой
              </button>
              <button
                onClick={copyLink}
                className="w-full py-3 rounded-xl font-medium glass hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name={copied ? "Check" : "Copy"} size={18} className={copied ? "text-green-400" : ""} />
                {copied ? "Ссылка скопирована!" : "Скопировать ссылку"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
