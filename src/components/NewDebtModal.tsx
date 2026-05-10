import { useState, useEffect, useRef } from "react";
import QRCodeLib from "qrcode";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";

const API_URL = func2url["debts"];
const AUTH_URL = func2url["auth"];

// ─── QR через canvas (локально, без внешних сервисов) ────────────────────────
function QRCode({ value, size = 200 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#a855f7", light: "#13152a" },
    });
  }, [value, size]);
  return <canvas ref={canvasRef} className="rounded-2xl" style={{ width: size, height: size }} />;
}

// ─── Share debt viewer (when opened via QR link) ─────────────────────────────
type AuthStep = "check_auth" | "phone" | "register" | "code" | "pin_login" | "set_pin" | "decision" | "done" | "rejected";

// ── Маска телефона +7 (XXX) XXX-XX-XX ──
function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let d = digits;
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7") && d.length > 0) d = "7" + d;
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  let out = "+7";
  if (d.length > 1) out += " (" + d.slice(1, 4);
  if (d.length >= 4) out += ") " + d.slice(4, 7);
  if (d.length >= 7) out += "-" + d.slice(7, 9);
  if (d.length >= 9) out += "-" + d.slice(9, 11);
  return out;
}
function phoneToE164Local(formatted: string): string {
  const d = formatted.replace(/\D/g, "");
  if (d.length !== 11) return "";
  return "+" + (d.startsWith("8") ? "7" + d.slice(1) : d);
}

export function SharedDebtView({ token }: { token: string }) {
  const [debt, setDebt] = useState<Record<string, string | number | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<AuthStep>("check_auth");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [userName, setUserName] = useState("");

  // Auth form
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState(["", "", "", ""]);
  const [pin, setPin] = useState("");
  const [pinFirst, setPinFirst] = useState("");
  const [pinStage, setPinStage] = useState<"first" | "confirm">("first");
  const [isNewUser, setIsNewUser] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [saving, setSaving] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const codeRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

  // При загрузке — проверяем есть ли уже токен
  useEffect(() => {
    const saved = localStorage.getItem("df-token");
    if (saved) {
      fetch(`${AUTH_URL}?action=me`, { headers: { Authorization: `Bearer ${saved}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => {
          if (u?.id) { setAuthToken(saved); setUserId(u.id); setUserName(u.full_name); }
        })
        .finally(() => loadDebt(saved));
    } else {
      loadDebt(null);
    }
  }, [token]);

  function loadDebt(tok: string | null) {
    fetch(`${API_URL}?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setDebt(d);
        setLoading(false);
        if (d.borrower_decision === "accepted") { setStep("done"); return; }
        if (d.borrower_decision === "rejected") { setStep("rejected"); return; }
        if (tok) setStep("decision");
        else setStep("phone");
      })
      .catch(() => { setError("Ошибка загрузки"); setLoading(false); });
  }

  async function checkPhoneStep() {
    const e164 = phoneToE164Local(phone);
    if (!e164) { setAuthError("Введите номер полностью"); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=check-phone`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || "Ошибка"); return; }
      if (!data.exists) {
        setIsNewUser(true);
        setStep("register");
      } else if (data.has_pin) {
        setIsNewUser(false);
        setStep("pin_login");
      } else {
        setIsNewUser(false);
        await sendSmsCode(e164);
        setStep("code");
      }
    } finally { setAuthLoading(false); }
  }

  async function sendSmsCode(phoneE164?: string) {
    const e164 = phoneE164 || phoneToE164Local(phone);
    setDevCode(null);
    const res = await fetch(`${AUTH_URL}?action=send-sms`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: e164 }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.dev_code) setDevCode(d.dev_code);
      return;
    }
    if (!res.ok) {
      const d = await res.json();
      setAuthError(d.error || "Ошибка отправки SMS");
      throw new Error(d.error);
    }
  }

  async function sendCodeForRegister() {
    if (!fullName.trim()) { setAuthError("Введите ФИО"); return; }
    setAuthLoading(true); setAuthError("");
    try {
      await sendSmsCode();
      setStep("code");
    } catch { /* error already set */ }
    finally { setAuthLoading(false); }
  }

  async function verifyCodeStep() {
    const c = code.join("");
    if (c.length < 4) return;
    setAuthLoading(true); setAuthError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=check-sms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneToE164Local(phone), code: c }),
      });
      const data = await res.json();
      if (res.ok) {
        setPinStage("first"); setPin(""); setPinFirst("");
        setStep("set_pin");
      } else {
        setAuthError(data.error || "Неверный код");
        setCode(["", "", "", ""]);
        codeRefs[0].current?.focus();
      }
    } finally { setAuthLoading(false); }
  }

  async function submitSetPin(value: string) {
    if (pinStage === "first") {
      setPinFirst(value);
      setPin("");
      setPinStage("confirm");
      return;
    }
    if (value !== pinFirst) {
      setAuthError("PIN не совпадает, попробуйте ещё раз");
      setPinStage("first"); setPinFirst(""); setPin("");
      return;
    }
    setAuthLoading(true); setAuthError("");
    const body: Record<string, string> = {
      phone: phoneToE164Local(phone),
      code: code.join(""),
      pin_code: value,
    };
    if (isNewUser && fullName.trim()) body.full_name = fullName.trim();
    const res = await fetch(`${AUTH_URL}?action=verify-sms`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setAuthLoading(false);
    if (res.ok) {
      localStorage.setItem("df-token", data.token);
      setAuthToken(data.token);
      setUserId(data.user.id);
      setUserName(data.user.full_name);
      setStep("decision");
    } else {
      setAuthError(data.error || "Ошибка");
      setStep("code");
      setCode(["", "", "", ""]);
    }
  }

  async function loginWithPin(value: string) {
    setAuthLoading(true); setAuthError("");
    const res = await fetch(`${AUTH_URL}?action=login-pin-phone`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneToE164Local(phone), pin: value }),
    });
    const data = await res.json();
    setAuthLoading(false);
    if (res.ok) {
      localStorage.setItem("df-token", data.token);
      setAuthToken(data.token);
      setUserId(data.user.id);
      setUserName(data.user.full_name);
      setStep("decision");
    } else {
      setAuthError(data.error || "Неверный PIN");
      setPin("");
    }
  }

  function handleCodeInput(i: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code]; next[i] = digit; setCode(next);
    if (digit && i < 3) codeRefs[i + 1].current?.focus();
    if (next.every(d => d !== "")) setTimeout(() => verifyCodeStep(), 100);
  }

  async function makeDecision(decision: "accepted" | "rejected") {
    if (!authToken || !userId) return;
    setSaving(true);
    await fetch(`${API_URL}?token=${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        borrower_decision: decision,
        borrower_user_id: userId,
        borrower_name: userName,
      }),
    });
    setSaving(false);
    setStep(decision === "accepted" ? "done" : "rejected");
  }

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

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors";
  const btnCls = "w-full py-3 rounded-xl font-semibold text-white text-sm disabled:opacity-50 transition-all";

  // Расчёт суммы с процентами
  const baseAmount = Number(debt!.amount);
  const interestRate = debt!.interest_rate != null ? Number(debt!.interest_rate) : null;
  const interestType = String(debt!.interest_type || "simple");
  const totalAmount = (() => {
    if (!interestRate || !debt!.due_date) return baseAmount;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(String(debt!.due_date)); due.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days <= 0) return baseAmount;
    const years = days / 365;
    if (interestType === "compound") return Math.round(baseAmount * Math.pow(1 + interestRate / 100, years));
    return Math.round(baseAmount * (1 + (interestRate / 100) * years));
  })();
  const interestAmount = totalAmount - baseAmount;

  // Карточка долга (показывается всегда)
  const DebtCard = () => (
    <div className="glass rounded-3xl p-5 mb-4" style={{ border: "1px solid rgba(168,85,247,0.3)" }}>
      <p className="text-muted-foreground text-xs mb-1 uppercase tracking-wider">
        {interestRate ? "Итого к возврату" : "Сумма долга"}
      </p>
      <p className="text-4xl font-black font-heading text-gradient-purple mb-1">{fmt(totalAmount)}</p>
      {interestRate && interestAmount > 0 && (
        <div className="flex gap-3 mb-4">
          <span className="text-xs text-muted-foreground">Тело: {fmt(baseAmount)}</span>
          <span className="text-xs text-violet-400">+ проценты: {fmt(interestAmount)}</span>
        </div>
      )}
      {!interestRate && <div className="mb-4" />}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 gradient-purple rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon name="TrendingUp" size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Кредитор</p>
            <p className="font-semibold text-foreground">{String(debt!.lender_name)}</p>
          </div>
        </div>
        {interestRate && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon name="Percent" size={16} className="text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Процентная ставка</p>
              <p className="font-semibold text-foreground">{interestRate}% ({interestType === "compound" ? "сложные" : "простые"})</p>
            </div>
          </div>
        )}
        {debt!.due_date && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Icon name="Calendar" size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Срок возврата</p>
              <p className="font-semibold text-foreground">
                {new Date(String(debt!.due_date)).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0f1a] text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="mesh-bg fixed inset-0 pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">

        {/* Лого */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 gradient-purple rounded-2xl flex items-center justify-center mx-auto mb-3 glow-purple">
            <Icon name="Handshake" size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black font-heading text-gradient-purple">Debt-Debt</h1>
          <p className="text-muted-foreground text-sm">Вас пригласили подтвердить долг</p>
        </div>

        <DebtCard />

        {/* ── Шаг: ввод телефона ── */}
        {step === "phone" && (
          <div className="glass rounded-2xl p-5 space-y-3">
            <div>
              <p className="font-semibold text-foreground mb-1">Войдите или зарегистрируйтесь</p>
              <p className="text-xs text-muted-foreground">Чтобы принять или отклонить долг, нужен аккаунт</p>
            </div>
            <input value={phone}
              onChange={e => { setPhone(formatPhoneInput(e.target.value)); setAuthError(""); }}
              onFocus={() => { if (!phone) setPhone("+7 ("); }}
              placeholder="+7 (900) 000-00-00" type="tel" inputMode="numeric" autoFocus
              className={inputCls} onKeyDown={e => e.key === "Enter" && checkPhoneStep()} />
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            <button onClick={checkPhoneStep} disabled={authLoading} className={btnCls} style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
              {authLoading ? "Проверяем..." : "Продолжить"}
            </button>
          </div>
        )}

        {/* ── Шаг: регистрация (только ФИО, телефон уже введён) ── */}
        {step === "register" && (
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("phone")} className="w-8 h-8 glass rounded-xl flex items-center justify-center">
                <Icon name="ChevronLeft" size={16} />
              </button>
              <div>
                <p className="font-semibold text-foreground">Регистрация</p>
                <p className="text-xs text-muted-foreground">{phone}</p>
              </div>
            </div>
            <input value={fullName}
              onChange={e => { setFullName(e.target.value); setAuthError(""); }}
              placeholder="ФИО" autoFocus className={inputCls}
              onKeyDown={e => e.key === "Enter" && sendCodeForRegister()} />
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            <button onClick={sendCodeForRegister} disabled={authLoading} className={btnCls} style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
              {authLoading ? "Отправляем SMS..." : "Получить код в SMS"}
            </button>
          </div>
        )}

        {/* ── Шаг: ввод кода из SMS ── */}
        {step === "code" && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <div>
              <p className="font-semibold text-foreground mb-1">Введите код из SMS</p>
              <p className="text-xs text-muted-foreground">Отправили на {phone}</p>
            </div>
            {devCode && (
              <div className="rounded-2xl px-4 py-3 text-center" style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.4)" }}>
                <p className="text-xs text-muted-foreground mb-1">Ваш код:</p>
                <p className="font-black text-3xl tracking-[8px] text-purple-300" style={{ textShadow: "0 0 12px rgba(168,85,247,0.5)" }}>{devCode}</p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              {[0, 1, 2, 3].map(i => (
                <input
                  key={i}
                  ref={codeRefs[i]}
                  value={code[i]}
                  onChange={e => handleCodeInput(i, e.target.value)}
                  onKeyDown={e => { if (e.key === "Backspace" && !code[i] && i > 0) codeRefs[i-1].current?.focus(); }}
                  maxLength={1}
                  inputMode="numeric"
                  className="w-14 h-14 text-center text-2xl font-bold bg-white/5 border border-white/10 rounded-xl outline-none focus:border-purple-500/50 text-foreground"
                />
              ))}
            </div>
            {authError && <p className="text-xs text-red-400 text-center">{authError}</p>}
            {authLoading && <div className="flex justify-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}
          </div>
        )}

        {/* ── Шаг: вход по PIN ── */}
        {step === "pin_login" && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep("phone")} className="w-8 h-8 glass rounded-xl flex items-center justify-center">
                <Icon name="ChevronLeft" size={16} />
              </button>
              <div>
                <p className="font-semibold text-foreground">Введите PIN</p>
                <p className="text-xs text-muted-foreground">{phone}</p>
              </div>
            </div>
            <input
              value={pin}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(v); setAuthError("");
                if (v.length === 4) loginWithPin(v);
              }}
              type="password" inputMode="numeric" maxLength={4} autoFocus
              placeholder="••••"
              className="w-full text-center text-3xl tracking-[12px] bg-white/5 border border-white/10 rounded-xl py-4 outline-none focus:border-purple-500/50 text-foreground"
            />
            {authError && <p className="text-xs text-red-400 text-center">{authError}</p>}
            <button onClick={async () => {
              setAuthLoading(true); setAuthError("");
              try { await sendSmsCode(); setStep("code"); setPin(""); } catch { /* */ }
              finally { setAuthLoading(false); }
            }} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              Забыли PIN? Сбросить через SMS
            </button>
          </div>
        )}

        {/* ── Шаг: установка PIN после регистрации ── */}
        {step === "set_pin" && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <div>
              <p className="font-semibold text-foreground mb-1">
                {pinStage === "first" ? "Придумайте PIN" : "Повторите PIN"}
              </p>
              <p className="text-xs text-muted-foreground">
                {pinStage === "first" ? "4 цифры — запомните его, нужен будет для входа" : "Введите тот же PIN ещё раз"}
              </p>
            </div>
            <input
              value={pin}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(v); setAuthError("");
                if (v.length === 4) {
                  submitSetPin(v);
                  setPin("");
                }
              }}
              type="password" inputMode="numeric" maxLength={4} autoFocus
              placeholder="••••"
              className="w-full text-center text-3xl tracking-[12px] bg-white/5 border border-white/10 rounded-xl py-4 outline-none focus:border-purple-500/50 text-foreground"
            />
            {authError && <p className="text-xs text-red-400 text-center">{authError}</p>}
            {authLoading && <div className="flex justify-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>}
          </div>
        )}

        {/* ── Шаг: принять/отклонить ── */}
        {step === "decision" && (
          <div className="glass rounded-2xl p-5 space-y-3">
            <div>
              <p className="font-semibold text-foreground mb-1">Привет, {userName}!</p>
              <p className="text-sm text-muted-foreground">Вы хотите принять этот долг?</p>
            </div>
            <button
              onClick={() => makeDecision("accepted")}
              disabled={saving}
              className={btnCls}
              style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
            >
              {saving ? "Сохраняем..." : "Принять долг"}
            </button>
            <button
              onClick={() => makeDecision("rejected")}
              disabled={saving}
              className="w-full py-3 rounded-xl font-semibold text-sm glass border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all"
            >
              Отклонить
            </button>
          </div>
        )}

        {/* ── Долг принят ── */}
        {step === "done" && (
          <div className="glass rounded-2xl p-5 text-center border border-green-500/20">
            <Icon name="CheckCircle2" size={36} className="text-green-400 mx-auto mb-3" />
            <p className="font-bold text-green-400 text-lg">Долг принят!</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Войдите в приложение, чтобы написать кредитору</p>
            <a href="/" className="block w-full py-3 rounded-xl font-semibold text-white text-sm text-center" style={{ background: "linear-gradient(135deg, #a855f7, #6366f1)" }}>
              Открыть приложение
            </a>
          </div>
        )}

        {/* ── Долг отклонён ── */}
        {step === "rejected" && (
          <div className="glass rounded-2xl p-5 text-center border border-red-500/20">
            <Icon name="XCircle" size={36} className="text-red-400 mx-auto mb-3" />
            <p className="font-bold text-red-400 text-lg">Долг отклонён</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Кредитор будет уведомлён. Долг останется у него со статусом «Отклонён».</p>
            <a href="/" className="block w-full py-3 rounded-xl font-semibold text-sm text-center glass border border-white/10 text-muted-foreground">
              Перейти в приложение
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── New Debt Modal ───────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  myName?: string;
  myPhone?: string;
  onCreated?: (debt: Record<string, string | number | null>) => void;
}

export default function NewDebtModal({ open, onClose, myName = "", myPhone = "", onCreated }: Props) {
  const [step, setStep] = useState<"form" | "qr">("form");
  const [loading, setLoading] = useState(false);
  const [createdDebt, setCreatedDebt] = useState<Record<string, string | number | null> | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    borrower_name: "",
    note: "",
    due_date: "",
    interest_rate: "",
    interest_type: "simple" as "simple" | "compound",
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

  function calcReturn(): { total: number; interest: number; days: number } | null {
    const amount = parseFloat(form.amount.replace(/\s/g, ""));
    const rate = parseFloat(form.interest_rate);
    if (!amount || !rate || rate <= 0) return null;
    if (!form.due_date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(form.due_date); due.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days <= 0) return null;
    const years = days / 365;
    let total: number;
    if (form.interest_type === "compound") {
      total = amount * Math.pow(1 + rate / 100, years);
    } else {
      total = amount * (1 + (rate / 100) * years);
    }
    return { total: Math.round(total), interest: Math.round(total - amount), days };
  }

  const returnCalc = calcReturn();

  async function create() {
    if (!form.title || !form.amount) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("df-token") || "";
      const r = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: form.title,
          amount: parseFloat(form.amount.replace(/\s/g, "")),
          lender_name: myName,
          lender_phone: myPhone || undefined,
          borrower_name: form.borrower_name || undefined,
          note: form.note || undefined,
          due_date: form.due_date || undefined,
          interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : undefined,
          interest_type: form.interest_rate ? form.interest_type : undefined,
          total_with_interest: returnCalc?.total || undefined,
        }),
      });
      const d = await r.json();
      if (d.share_token) {
        setCreatedDebt(d);
        setStep("qr");
        onCreated?.(d);
      }
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

  function close() { setStep("form"); setCreatedDebt(null); setForm({ title: "", amount: "", borrower_name: "", note: "", due_date: "", interest_rate: "", interest_type: "simple" }); onClose(); }

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

            {/* Кредитор из профиля */}
            {myName ? (
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                <div className="w-8 h-8 gradient-purple rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon name="User" size={15} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Кредитор (вы)</p>
                  <p className="text-sm font-semibold text-foreground truncate">{myName}{myPhone ? ` · ${myPhone}` : ""}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
                <Icon name="AlertCircle" size={16} className="text-yellow-400 flex-shrink-0" />
                <p className="text-xs text-yellow-300">Заполните профиль в <strong>Настройках</strong>, чтобы ваше имя подставлялось автоматически</p>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Название / описание *</label>
              <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Займ на ремонт" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Сумма (₽) *</label>
              <input value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="10 000" type="number" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Имя должника (необязательно)</label>
              <input value={form.borrower_name} onChange={e => set("borrower_name", e.target.value)} placeholder="Пётр Петров" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Срок возврата</label>
              <input value={form.due_date} onChange={e => set("due_date", e.target.value)} type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-purple-500/50 transition-colors" style={{ colorScheme: "dark" }} />
            </div>

            {/* Процентная ставка */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Процентная ставка (% годовых)</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={form.interest_rate}
                    onChange={e => set("interest_rate", e.target.value)}
                    placeholder="0"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => set("interest_type", form.interest_type === "simple" ? "compound" : "simple")}
                  className="px-3 py-2.5 rounded-xl text-xs font-medium glass border border-white/10 hover:bg-white/10 transition-colors whitespace-nowrap"
                  title="Тип начисления"
                >
                  {form.interest_type === "simple" ? "Простые" : "Сложные"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {form.interest_type === "simple" ? "Простые проценты — начисляются только на основную сумму" : "Сложные проценты — начисляются на сумму с процентами"}
              </p>
            </div>

            {/* Карточка пересчёта */}
            {returnCalc && (
              <div className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="Calculator" size={14} className="text-purple-400" />
                  <span className="text-xs font-semibold text-purple-300">Итого к возврату</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-black font-heading text-gradient-purple">{fmt(returnCalc.total)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Основной долг: {fmt(parseFloat(form.amount.replace(/\s/g, "")))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-400">+{fmt(returnCalc.interest)}</div>
                    <div className="text-[10px] text-muted-foreground">за {returnCalc.days} дн.</div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Заметка</label>
              <textarea value={form.note} onChange={e => set("note", e.target.value)} placeholder="Дополнительные условия..." rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors resize-none" />
            </div>

            <button
              onClick={create}
              disabled={loading || !form.title || !form.amount}
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