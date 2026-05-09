import { useState, useRef } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../../backend/func2url.json";
import { DEMO_USER } from "../App";

const AUTH_URL = func2url["auth"];

// email → check-email →
//   новый: register (ФИО+телефон) → email-code → set-pin (2 раза) → вход
//   старый с PIN: pin-login
//   старый без PIN (старый аккаунт): email-code → set-pin → вход
type Step = "email" | "register" | "email-code" | "set-pin" | "pin-login";

interface Props {
  onAuth: (token: string, user: { id: number; full_name: string; phone: string; email: string }) => void;
}

function PinDots({ values }: { values: string[] }) {
  return (
    <div className="flex gap-4 justify-center my-2">
      {values.map((v, i) => (
        <div key={i} className="w-4 h-4 rounded-full transition-all duration-150"
          style={{ background: v ? "#a855f7" : "rgba(255,255,255,0.15)", boxShadow: v ? "0 0 8px rgba(168,85,247,0.6)" : "none" }} />
      ))}
    </div>
  );
}

function PinInput({ title, subtitle, pin, onChange, onComplete, error, onClear }: {
  title: string; subtitle: string; pin: string[]; onChange: (pin: string[]) => void;
  onComplete?: (pin: string) => void; error: string; onClear: () => void;
}) {

  function handleDigit(digit: string) {
    if (pin.length >= 4) return;
    const next = [...pin, digit];
    onChange(next);
    if (next.length === 4 && onComplete) onComplete(next.join(""));
  }

  function handleBack() {
    if (pin.length === 0) return;
    onChange(pin.slice(0, -1));
  }

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <PinDots values={[...pin, ...Array(4 - pin.length).fill("")]} />
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {digits.map((d, i) => (
          d === "" ? <div key={i} /> :
          d === "⌫" ? (
            <button key={i} onClick={handleBack}
              className="h-14 rounded-2xl flex items-center justify-center text-muted-foreground hover:bg-white/10 transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <Icon name="Delete" size={20} />
            </button>
          ) : (
            <button key={i} onClick={() => handleDigit(d)}
              className="h-14 rounded-2xl font-bold text-xl text-foreground transition-all active:scale-95 hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              {d}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

export default function Auth({ onAuth }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [emailCode, setEmailCode] = useState(["", "", "", ""]);
  const [pin, setPin] = useState<string[]>([]);
  const [pinConfirm, setPinConfirm] = useState<string[]>([]);
  const [pinStep, setPinStep] = useState<"first" | "confirm">("first");
  const [firstPin, setFirstPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const codeRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // ── Email: проверяем существование ──
  async function checkEmail() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) { setError("Введите корректный email"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=check-email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }), signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); return; }
      if (!data.exists) {
        setStep("register"); // новый — заполнить данные
      } else if (data.has_pin) {
        setStep("pin-login"); // старый с PIN — вводит PIN
      } else {
        // старый без PIN — отправляем код для установки PIN
        await sendEmailCode(e);
        setStep("email-code");
      }
    } catch { setError("Нет ответа от сервера."); }
    finally { setLoading(false); }
  }

  // ── Отправить код на почту ──
  async function sendEmailCode(emailAddr?: string) {
    const e = emailAddr || email.trim().toLowerCase();
    const res = await fetch(`${AUTH_URL}?action=send-code`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, full_name: fullName.trim() || undefined }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (res.ok) { setCountdown(60); startCountdown(); }
    else { setError(data.error || "Ошибка отправки"); }
  }

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(timer); return 0; } return c - 1; });
    }, 1000);
  }

  // ── Регистрация: переход к отправке кода ──
  async function handleRegisterNext() {
    if (!fullName.trim()) { setError("Введите ФИО"); return; }
    if (!phone.trim()) { setError("Введите телефон"); return; }
    setLoading(true); setError("");
    try {
      await sendEmailCode();
      setStep("email-code");
    } catch { setError("Ошибка"); }
    finally { setLoading(false); }
  }

  // ── Проверка email-кода на сервере ──
  async function verifyEmailCode(codeStr?: string) {
    const c = codeStr || emailCode.join("");
    if (c.length < 4) { setError("Введите 4-значный код"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=check-code`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: c }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (res.ok) {
        setPinStep("first"); setPin([]); setPinConfirm([]);
        setStep("set-pin");
      } else {
        setError(data.error || "Неверный код");
        setEmailCode(["","","",""]);
        codeRefs[0].current?.focus();
      }
    } catch { setError("Нет ответа от сервера."); }
    finally { setLoading(false); }
  }

  function handleEmailCodeInput(i: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...emailCode]; next[i] = digit; setEmailCode(next);
    if (digit && i < 3) codeRefs[i + 1].current?.focus();
    if (next.every(d => d !== "")) verifyEmailCode(next.join(""));
  }

  // ── Установка PIN ──
  function handlePinFirst(p: string) {
    setFirstPin(p);
    setPinStep("confirm");
    setPin([]);
    setError("");
  }

  async function handlePinConfirm(p: string) {
    if (p !== firstPin) {
      setError("PIN не совпадает, попробуй ещё раз");
      setPinStep("first"); setPin([]); setPinConfirm([]); setFirstPin("");
      return;
    }
    // Финальный запрос — verify с PIN
    setLoading(true); setError("");
    try {
      const body: Record<string, string> = {
        email: email.trim().toLowerCase(),
        code: emailCode.join(""),
        pin_code: p,
      };
      if (fullName.trim()) body.full_name = fullName.trim();
      if (phone.trim()) body.phone = phone.trim();
      const res = await fetch(`${AUTH_URL}?action=verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("df-token", data.token);
        onAuth(data.token, data.user);
      } else {
        setError(data.error || "Ошибка");
        setStep("email-code"); setEmailCode(["","","",""]);
      }
    } catch { setError("Нет ответа от сервера."); }
    finally { setLoading(false); }
  }

  // ── Вход по PIN ──
  async function handlePinLogin(p: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${AUTH_URL}?action=login-pin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), pin: p }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("df-token", data.token);
        onAuth(data.token, data.user);
      } else {
        setError(data.error || "Неверный PIN");
        setPin([]);
      }
    } catch { setError("Нет ответа от сервера."); }
    finally { setLoading(false); }
  }

  const btnCls = "w-full py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50";
  const btnStyle = { background: "linear-gradient(135deg, #a855f7, #6366f1)" };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--app-bg)" }}>
      <div className="mesh-bg" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="auth-dd-logo mx-auto mb-4">
            <div className="auth-dd-glow" />
            <span className="auth-dd-left">D</span>
            <span className="auth-dd-right">D</span>
            <span className="auth-dd-tri">{'>'}</span>
            <span className="auth-dd-ring" />
          </div>
          <h1 className="font-heading font-black text-2xl text-gradient-purple auth-dd-title">Debt-Debt</h1>
          <p className="text-muted-foreground text-sm mt-1 auth-dd-sub">Управление долгами и займами</p>
        </div>

        <style>{`
          .auth-dd-logo {
            position: relative;
            width: 88px; height: 88px; border-radius: 22px;
            background: radial-gradient(circle at 50% 50%, #1a1f5c 0%, #0d1240 100%);
            box-shadow: 0 0 30px rgba(168,85,247,0.35), 0 0 60px rgba(99,102,241,0.18);
            overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            animation: authLogoPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
          }
          .auth-dd-glow {
            position: absolute; inset: 0;
            background: radial-gradient(circle at 30% 30%, rgba(168,85,247,0.25) 0%, transparent 55%);
            pointer-events: none;
          }
          .auth-dd-left, .auth-dd-right {
            position: absolute; top: 50%;
            font-size: 58px; line-height: 1; font-weight: 900;
            font-family: Montserrat, sans-serif;
          }
          .auth-dd-left {
            left: 8px; color: #c026d3;
            text-shadow: 0 0 12px rgba(217,70,239,0.85), 0 0 22px rgba(168,85,247,0.55);
            animation: authLeftD 0.7s 0.1s cubic-bezier(0.34,1.56,0.64,1) both;
          }
          .auth-dd-right {
            right: 8px; color: #4f6df5;
            text-shadow: 0 0 10px rgba(99,102,241,0.6);
            animation: authRightD 0.7s 0.1s cubic-bezier(0.34,1.56,0.64,1) both;
          }
          .auth-dd-tri {
            position: absolute; left: 50%; top: 50%;
            font-size: 18px; line-height: 1; font-weight: 900;
            font-family: Montserrat, sans-serif;
            color: #ec4899;
            text-shadow: 0 0 6px rgba(236,72,153,0.95), 0 0 10px rgba(236,72,153,0.55);
            animation: authTri 0.5s 0.75s cubic-bezier(0.34,1.56,0.64,1) both;
          }
          .auth-dd-ring {
            position: absolute; left: 50%; top: 50%;
            width: 10px; height: 10px; border-radius: 50%;
            border: 2px solid #ec4899;
            transform: translate(-50%, -50%);
            opacity: 0;
            animation: authRing 0.85s 0.85s ease-out both;
            pointer-events: none;
          }
          .auth-dd-title { animation: authFade 0.5s 1.05s ease both; opacity: 0; }
          .auth-dd-sub   { animation: authFade 0.5s 1.2s ease both; opacity: 0; }
          @keyframes authLogoPop {
            from { transform: scale(0.7); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
          }
          @keyframes authLeftD {
            0%   { transform: translate(-90px, -50%) rotate(-12deg); opacity: 0; }
            70%  { transform: translate(4px, -50%) rotate(2deg); opacity: 1; }
            100% { transform: translate(0, -50%) rotate(0); opacity: 1; }
          }
          @keyframes authRightD {
            0%   { transform: translate(90px, -50%) rotate(12deg); opacity: 0; }
            70%  { transform: translate(-4px, -50%) rotate(-2deg); opacity: 1; }
            100% { transform: translate(0, -50%) rotate(0); opacity: 1; }
          }
          @keyframes authTri {
            0%   { transform: translate(-50%, -50%) scale(0) rotate(-90deg); opacity: 0; }
            60%  { transform: translate(-50%, -50%) scale(1.4) rotate(0); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1) rotate(0); opacity: 1; }
          }
          @keyframes authRing {
            0%   { width: 10px;  height: 10px; opacity: 0.9; border-width: 2px; }
            100% { width: 80px;  height: 80px; opacity: 0;   border-width: 1px; }
          }
          @keyframes authFade {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <div className="glass rounded-3xl p-6">

          {/* ── Шаг: Email ── */}
          {step === "email" && (
            <div className="space-y-4">
              <div>
                <h2 className="font-heading font-bold text-lg text-foreground">Войти или зарегистрироваться</h2>
                <p className="text-xs text-muted-foreground mt-1">Введите ваш email</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <input type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && checkEmail()}
                  placeholder="ivan@example.com" autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={checkEmail} disabled={loading} className={btnCls} style={btnStyle}>
                {loading ? "Проверяем..." : "Продолжить"}
              </button>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-muted-foreground">или</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <button onClick={() => onAuth("demo", DEMO_USER)}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all border border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground">
                Войти в демо-режиме
              </button>
            </div>
          )}

          {/* ── Шаг: Регистрация ── */}
          {step === "register" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep("email"); setError(""); }}
                  className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <div>
                  <h2 className="font-heading font-bold text-base text-foreground">Регистрация</h2>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
                <input type="text" value={fullName}
                  onChange={e => { setFullName(e.target.value); setError(""); }}
                  placeholder="Иванов Иван Иванович" autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                <input type="tel" value={phone}
                  onChange={e => { setPhone(e.target.value); setError(""); }}
                  onFocus={() => { if (!phone) setPhone("+"); }}
                  onBlur={() => { if (phone === "+") setPhone(""); }}
                  placeholder="+7 900 000 00 00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={handleRegisterNext} disabled={loading} className={btnCls} style={btnStyle}>
                {loading ? "Отправляем код..." : "Получить код на почту"}
              </button>
            </div>
          )}

          {/* ── Шаг: Код из письма ── */}
          {step === "email-code" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setStep(fullName ? "register" : "email"); setError(""); }}
                  className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <div>
                  <h2 className="font-heading font-bold text-base text-foreground">Код из письма</h2>
                  <p className="text-xs text-muted-foreground">Отправили на {email}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">Введите 4-значный код из письма</p>
              <div className="flex gap-3 justify-center">
                {emailCode.map((v, i) => (
                  <input key={i} ref={codeRefs[i]} type="text" inputMode="numeric" maxLength={1} value={v}
                    onChange={e => handleEmailCodeInput(i, e.target.value)}
                    onKeyDown={e => { if (e.key === "Backspace" && !emailCode[i] && i > 0) codeRefs[i-1].current?.focus(); }}
                    className="w-14 h-14 text-center text-2xl font-bold bg-white/5 border border-white/10 rounded-2xl text-foreground outline-none focus:border-purple-500/50 transition-colors"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              {error && <p className="text-xs text-red-400 text-center">{error}</p>}
              <button onClick={verifyEmailCode} disabled={loading || emailCode.some(d => !d)} className={btnCls} style={btnStyle}>
                {loading ? "Проверяем..." : "Продолжить"}
              </button>
              <button onClick={() => sendEmailCode()} disabled={countdown > 0}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                {countdown > 0 ? `Отправить снова через ${countdown}с` : "Отправить код ещё раз"}
              </button>
            </div>
          )}

          {/* ── Шаг: Установка PIN ── */}
          {step === "set-pin" && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => { setStep("email-code"); setError(""); setPinStep("first"); setPin([]); }}
                  className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <h2 className="font-heading font-bold text-base text-foreground">Придумайте PIN</h2>
              </div>
              {pinStep === "first" ? (
                <PinInput
                  title="Введите PIN-код"
                  subtitle="4 цифры — запомните его"
                  pin={pin}
                  onChange={setPin}
                  onComplete={handlePinFirst}
                  error={error}
                  onClear={() => { setPin([]); setError(""); }}
                />
              ) : (
                <PinInput
                  title="Повторите PIN-код"
                  subtitle="Введите тот же PIN ещё раз"
                  pin={pinConfirm}
                  onChange={setPinConfirm}
                  onComplete={handlePinConfirm}
                  error={error}
                  onClear={() => { setPinConfirm([]); setError(""); }}
                />
              )}
              {loading && <p className="text-xs text-center text-muted-foreground mt-3">Сохраняем...</p>}
            </div>
          )}

          {/* ── Шаг: Вход по PIN ── */}
          {step === "pin-login" && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => { setStep("email"); setError(""); setPin([]); }}
                  className="w-8 h-8 glass rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                <div>
                  <h2 className="font-heading font-bold text-base text-foreground">Введите PIN</h2>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <PinInput
                title=""
                subtitle="Введите ваш 4-значный PIN"
                pin={pin}
                onChange={setPin}
                onComplete={handlePinLogin}
                error={error}
                onClear={() => { setPin([]); setError(""); }}
              />
              {loading && <p className="text-xs text-center text-muted-foreground mt-3">Входим...</p>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}